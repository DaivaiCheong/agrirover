"""The rover's messages become the screen's state, and a finished survey is stored."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.missions import SIM_DRAIN_V_PER_M, SIM_STOP_V, TOPIC_ESTOP, TOPIC_MISSION_SET, get_publisher
from app.routers import missions
from app.services.rover_live import live

sent: list[tuple[str, dict]] = []


async def fake_publish(topic: str, payload: dict) -> None:
    sent.append((topic, payload))


async def broker_down(topic: str, payload: dict) -> None:
    raise OSError("connection refused")


client = TestClient(app)


async def no_base(session, zone):
    return {"soil_moisture": 60.0}, 9.0


async def no_trees(*args, **kwargs):
    return None


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    monkeypatch.setattr(missions, "_sim_base", no_base)          # these tests have no database behind them
    monkeypatch.setattr(missions.advice, "advise_live_trees", no_trees)
    live.reset()
    sent.clear()
    app.dependency_overrides[get_publisher] = lambda: fake_publish
    yield
    app.dependency_overrides.clear()
    live.reset()


def start(**extra) -> str:
    r = client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 2, "cols": 5, **extra})
    assert r.status_code == 202
    return r.json()["missionId"]


def running(mission_id, row=0, col=0, scanned=1, **extra):
    return {"missionId": mission_id, "status": "running", "zoneId": "g1", "rows": 2, "cols": 5, "cellM": 3.0, "rowM": 3.0,
            "simulated": True, "cell": [row, col], "cellsScanned": scanned, "cellsTotal": 10, "battery": 12.5,
            "observation": {"row": row, "col": col, "plant": True, "flagged": False, "canopy": 0.4, "readings": {"soil_moisture": 60}},
            "frame": f"photo-{row}-{col}", **extra}


def test_a_plain_mission_sends_no_simulation_options():
    start()
    topic, payload = sent[0]
    assert topic == TOPIC_MISSION_SET and "sim" not in payload


def test_each_scenario_is_set_where_the_map_shows_both_parts():
    start(simulate="normal")
    assert set(sent[-1][1]["sim"]) == {"seed", "speedup", "base", "moistureSpread"}
    live.reset()
    start(simulate="rain")
    assert sent[-1][1]["sim"]["rainAtCell"] == 4
    live.reset()
    start(simulate="low_battery")
    expected = SIM_STOP_V + SIM_DRAIN_V_PER_M * 3.0 * 4
    assert sent[-1][1]["sim"]["batteryV"] == pytest.approx(expected)


def test_an_unknown_scenario_is_refused():
    r = client.post("/api/v1/missions", json={"zoneId": "z", "rows": 1, "cols": 1, "simulate": "meteor"})
    assert r.status_code == 422


def test_the_live_view_builds_up_from_the_rovers_messages():
    m = start(simulate="normal")
    assert client.get("/api/v1/missions/live").json()["mission"]["status"] == "queued"
    live.on_state({**running(m), "observation": None, "frame": None, "cell": None, "cellsScanned": 0})
    live.on_state(running(m))
    live.on_state(running(m, 0, 1, 2))
    got = client.get("/api/v1/missions/live").json()["mission"]
    assert got["status"] == "running" and got["cell"] == [0, 1] and got["cellsScanned"] == 2
    assert [(c["row"], c["col"]) for c in got["cells"]] == [(0, 0), (0, 1)]
    assert got["frame"] == "photo-0-1" and "frame" not in got["cells"][0]    # a poll stays small
    assert client.get("/api/v1/missions/live/frames/0/0").json() == {"frame": "photo-0-0"}
    assert client.get("/api/v1/missions/live/frames/1/1").json() == {"frame": None}


def test_a_finished_survey_keeps_its_cells_and_says_why_it_stopped():
    m = start()
    live.on_state(running(m))
    live.on_state({"missionId": m, "status": "aborted", "abortReason": "battery_low", "cellsScanned": 1, "distanceM": 0.5})
    got = client.get("/api/v1/missions/live").json()["mission"]
    assert (got["status"], got["reason"], got["distanceM"]) == ("aborted", "battery_low", 0.5)
    assert len(got["cells"]) == 1


def test_the_report_fills_in_cells_lost_on_the_way():
    m = start()
    live.on_state(running(m))
    live.on_result({"missionId": m, "cells": [{"row": 0, "col": 0, "plant": False}, {"row": 1, "col": 4, "plant": True}]})
    cells = client.get("/api/v1/missions/live").json()["mission"]["cells"]
    assert [(c["row"], c["col"], c["plant"]) for c in cells] == [(0, 0, False), (1, 4, True)]
    live.on_result({"missionId": "another", "cells": [{"row": 0, "col": 1, "plant": True}]})
    assert len(client.get("/api/v1/missions/live").json()["mission"]["cells"]) == 2


def test_a_second_survey_cannot_start_over_a_running_one():
    start()
    assert client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 1, "cols": 1}).status_code == 409
    assert len(sent) == 1


def test_a_refusal_of_another_request_does_not_end_this_survey():
    m = start()
    live.on_state(running(m))
    live.on_state({"missionId": str(uuid.uuid4()), "status": "rejected", "reason": "busy"})
    assert client.get("/api/v1/missions/live").json()["mission"]["status"] == "running"
    live.on_state({"missionId": m, "status": "rejected", "reason": "estop_engaged"})
    got = client.get("/api/v1/missions/live").json()["mission"]
    assert (got["status"], got["reason"]) == ("rejected", "estop_engaged")


def test_an_old_finished_message_after_a_restart_is_ignored():
    live.on_state({"missionId": str(uuid.uuid4()), "status": "completed", "cellsScanned": 40})
    assert client.get("/api/v1/missions/live").json()["mission"] is None


def test_a_survey_in_progress_is_picked_up_after_a_restart():
    m = str(uuid.uuid4())
    live.on_state(running(m))
    got = client.get("/api/v1/missions/live").json()["mission"]
    assert (got["missionId"], got["status"], got["cellsTotal"]) == (m, "running", 10)


def test_a_rover_that_disappears_mid_survey_ends_it_as_lost():
    m = start()
    live.on_status({"status": "online"})
    live.on_state(running(m))
    live.on_status({"status": "offline"})
    snap = client.get("/api/v1/missions/live").json()
    assert snap["rover"]["status"] == "offline"
    assert (snap["mission"]["status"], snap["mission"]["reason"]) == ("lost", "link_lost")
    # and nothing starts until it is back
    assert client.post("/api/v1/missions", json={"zoneId": "z", "rows": 1, "cols": 1}).status_code == 409


def test_nonsense_messages_change_nothing():
    for bad in ("text", 3, None, [], {"status": "dancing"}):
        live.on_status(bad)
        live.on_state(bad)
        live.on_result(bad)
    assert client.get("/api/v1/missions/live").json() == {
        "rover": {"code": "ROVER-01", "status": "unknown", "estop": False}, "mission": None}


def test_estop_reaches_the_rover_and_blocks_a_start_until_released():
    assert client.post("/api/v1/missions/estop", json={"engaged": True}).json() == {"estop": True}
    assert sent[-1] == (TOPIC_ESTOP, {"estop": True})
    assert client.post("/api/v1/missions", json={"zoneId": "z", "rows": 1, "cols": 1}).status_code == 409
    client.post("/api/v1/missions/estop", json={"engaged": False})
    assert sent[-1] == (TOPIC_ESTOP, {"estop": False})
    start()


def test_an_estop_that_cannot_be_sent_says_so_and_is_not_marked_engaged():
    app.dependency_overrides[get_publisher] = lambda: broker_down
    r = client.post("/api/v1/missions/estop", json={"engaged": True})
    assert r.status_code == 503 and "NOT sent" in r.json()["detail"]
    assert client.get("/api/v1/missions/live").json()["rover"]["estop"] is False


def test_the_rovers_own_word_on_the_estop_survives_a_server_restart():
    live.on_status({"status": "online", "estop": True})                     # the retained message, on reconnecting
    assert client.get("/api/v1/missions/live").json()["rover"]["estop"] is True
    assert client.post("/api/v1/missions", json={"zoneId": "z", "rows": 1, "cols": 1}).status_code == 409
    live.on_status({"status": "online", "estop": False})
    assert client.get("/api/v1/missions/live").json()["rover"]["estop"] is False
    live.on_status({"status": "online"})                                    # older rover software says nothing: keep it
    assert client.get("/api/v1/missions/live").json()["rover"]["estop"] is False


# ---- storing: a real database

import pgdb                                                                 # noqa: E402
from sqlalchemy import select                                               # noqa: E402

from app.models.entities import Metric, SensorReading, SurveyFinding, SurveyMission  # noqa: E402
from app.services.rover_live import bed_means, store_report                 # noqa: E402
from app.services.seed import seed_stage1                                   # noqa: E402


def _report(mission_id, zone="g1", **extra):
    return {"missionId": mission_id, "zoneId": zone, "status": "aborted", "abortReason": "rain", "simulated": True,
            "cellsScanned": 2, "cellsTotal": 4, "plantsDetected": 1, "cellsFlagged": 1,
            "distanceM": 3.0, "estDurationS": 90, "startedAt": "2026-11-05T01:00:00+00:00",
            "finishedAt": "2026-11-05T01:01:00+00:00", "grid": {"rows": 2, "cols": 2, "cellM": 3.0, "rowM": 3.0},
            "cells": [
                {"row": 0, "col": 0, "canopy": 0.4, "plant": True, "chlorosis": 0.2, "flagged": True, "disease": None, "disease_confidence": None,
                 "readings": {"soil_moisture": 60.0, "soil_ec": 2.0, "nitrogen": 100}},
                {"row": 0, "col": 1, "canopy": 0.0, "plant": False, "chlorosis": 0.0, "flagged": False, "disease": None, "disease_confidence": None, "readings": {}},
            ], **extra}


def test_a_bed_mean_uses_only_the_trees_that_gave_a_reading():
    assert bed_means([{"readings": {"soil_moisture": 60}}, {"readings": {"soil_moisture": 70, "not_a_metric": 1}}, {"readings": {}}, {}]) == {"soil_moisture": 65}


@pgdb.with_db("aaf_test_rover")
async def test_a_round_is_stored_once_and_read_back(Session):
    async with Session() as s:
        await seed_stage1(s)
    mid = str(uuid.uuid4())
    async with Session() as s:
        assert await store_report(s, _report(mid)) is True
    async with Session() as s:
        assert await store_report(s, _report(mid)) is False                          # a repeat changes nothing
        assert await store_report(s, _report(str(uuid.uuid4()), zone="nope")) is False  # an unknown bed is not saved
        assert await store_report(s, _report("sim-seed7")) is False                  # not one of this server's rounds
        assert await store_report(s, "text") is False
        assert len((await s.scalars(select(SurveyMission))).all()) == 1
        found = (await s.scalars(select(SurveyFinding).order_by(SurveyFinding.cell_col))).all()
        assert found[0].readings["soil_moisture"] == 60 and found[1].readings == {}
        # the rover feeds the same table a fixed probe would
        moisture = (await s.scalars(select(SensorReading).where(SensorReading.metric == Metric.soil_moisture))).all()
        assert [float(r.value) for r in moisture] == [60.0] and moisture[0].sensor_id is not None

    async with pgdb.api(Session) as c:
        listed = (await c.get("/api/v1/missions")).json()
        assert [m["id"] for m in listed] == [mid]
        assert (listed[0]["status"], listed[0]["abortReason"], listed[0]["simulated"]) == ("aborted", "rain", True)
        assert (listed[0]["rows"], listed[0]["cols"], listed[0]["cellM"], listed[0]["cellsFlagged"]) == (2, 2, 3.0, 1)
        one = (await c.get(f"/api/v1/missions/{mid}")).json()
        cells = sorted(one["cells"], key=lambda x: x["col"])
        assert (cells[0]["plant"], cells[0]["flagged"], cells[0]["readings"]["soil_ec"]) == (True, True, 2.0)
        assert (await c.get(f"/api/v1/missions/{uuid.uuid4()}")).status_code == 404
        assert (await c.get("/api/v1/missions/not-an-id")).status_code == 422
