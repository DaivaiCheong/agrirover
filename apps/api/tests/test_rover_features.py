"""The rover features brought over from the PostgreSQL line, on MongoDB: plant maps, rounds that stop at the plants,
photos taken on a round (kept, checked, shown on the plant), Plant Inspection, and Rover › Test (the ESP32 boards)."""
import asyncio
import base64

import pytest

from app.core.db import get_database
from app.main import app
from app.routers import missions_routes, rover_test as rover_test_router
from app.services import photo_check
from app.services.rover_service import live
from app.services.rover_test import frame, parse, tester
from app.workers.mqtt_ingest import handle_message

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
JPEG = b"\xff\xd8\xff" + b"1" * 64


@pytest.fixture(autouse=True)
def fresh_state(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "photo_dir", str(tmp_path))
    live.__init__()
    tester.__init__()
    yield
    live.__init__()
    tester.__init__()
    app.dependency_overrides.clear()


@pytest.fixture
def sent(monkeypatch):
    out: list[tuple[str, dict, bool]] = []

    async def fake_publish(topic, payload, *, retain=False):
        out.append((topic, payload, retain))

    monkeypatch.setattr(missions_routes, "publish", fake_publish)
    return out


@pytest.mark.asyncio
async def test_plant_maps_set_a_grid_and_make_a_block(api_client):
    put = await api_client.put("/api/v1/plant-maps/g1", json={"crop": "Tomato", "rows": 4, "cols": 4, "rowM": 5, "plantM": 5,
                                                              "plants": [[0, 0], [0, 1], [0, 1], [3, 3]]})
    assert put.status_code == 200, put.text
    assert put.json()["plants"] == [[0, 0], [0, 1], [3, 3]]              # one plant a spot, in order
    outside = await api_client.put("/api/v1/plant-maps/g1", json={"rows": 2, "cols": 2, "rowM": 1, "plantM": 1, "plants": [[5, 0]]})
    assert outside.status_code == 422
    assert (await api_client.put("/api/v1/plant-maps/nope", json={"rows": 1, "cols": 1, "rowM": 1, "plantM": 1})).status_code == 404

    made = await api_client.post("/api/v1/plant-maps", json={"label": "Demo tomato", "rows": 2, "cols": 3, "rowM": 1.2,
                                                             "plantM": 0.5, "plants": [[0, 0], [1, 2]]})
    assert made.status_code == 201, made.text
    assert made.json()["zone"] == "demo-tomato"
    zone = next(z for z in (await api_client.get("/api/v1/zones")).json() if z["zone"] == "demo-tomato")
    assert zone["areaM2"] == pytest.approx(3.6)                         # 2 rows x 1.2 m x 3 spots x 0.5 m
    maps = (await api_client.get("/api/v1/plant-maps")).json()
    assert {m["zone"] for m in maps} == {"g1", "demo-tomato"}


@pytest.mark.asyncio
async def test_a_round_stops_at_the_plants_and_follows_the_route(api_client, sent):
    r = await api_client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 4, "cols": 4, "cellM": 5, "rowM": 5, "start": "ne",
                                                        "along": "across", "stops": [[3, 3], [0, 0], [0, 0]], "inspect": True,
                                                        "look": "left", "simulate": "low_battery"})
    assert r.status_code == 202, r.text
    payload = sent[-1][1]
    assert payload["stops"] == [[0, 0], [3, 3]] and payload["inspect"] is True and payload["look"] == "left"
    assert (payload["start"], payload["along"]) == ("ne", "across")
    assert 11.1 < payload["sim"]["batteryV"] < 11.2                     # it runs down about 40 % of the way along
    snap = (await api_client.get("/api/v1/missions/live")).json()["mission"]
    assert snap["cellsTotal"] == 2 and snap["stops"] == [[0, 0], [3, 3]]
    bad = await api_client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 2, "cols": 2, "stops": [[2, 2]]})
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_each_plant_shows_as_the_rover_reaches_it_and_a_lost_link_ends_the_round(api_client, sent):
    db = get_database()
    mid = (await api_client.post("/api/v1/missions", json={"zoneId": "g2", "rows": 2, "cols": 5})).json()["missionId"]
    await handle_message(db, "devices/rover-01/mission/state", {
        "missionId": mid, "status": "running", "zoneId": "g2", "rows": 2, "cols": 5, "cell": [0, 1], "cellsScanned": 2,
        "cellsTotal": 10, "battery": 12.4, "simulated": True,
        "observation": {"row": 0, "col": 1, "plant": True, "flagged": False, "readings": {"soil_moisture": 61.0}}})
    m = (await api_client.get("/api/v1/missions/live")).json()["mission"]
    assert m["status"] == "running" and m["cellsScanned"] == 2
    assert m["cells"] == [{"row": 0, "col": 1, "plant": True, "flagged": False, "readings": {"soil_moisture": 61.0}}]

    await handle_message(db, "devices/rover-01/status", {"status": "offline"})
    m = (await api_client.get("/api/v1/missions/live")).json()["mission"]
    assert (m["status"], m["reason"]) == ("lost", "link_lost")


async def _photo_round(api_client, *, inspect: bool, simulated: bool = False):
    mid = (await api_client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 4, "cols": 4, "inspect": inspect})).json()["missionId"]
    state = {"missionId": mid, "status": "running", "zoneId": "g1", "rows": 4, "cols": 4, "cell": [1, 2], "inspect": inspect,
             "simulated": simulated, "photo": base64.b64encode(PNG).decode(),
             "observation": {"row": 1, "col": 2, "plant": True, "flagged": not inspect, "canopy": 0.4, "chlorosis": 0.2,
                             "readings": {"soil_moisture": 55.0, "nitrogen": 70}}}
    return mid, state


@pytest.mark.asyncio
async def test_a_flagged_plants_photo_is_kept_and_without_a_model_says_so(api_client, sent, monkeypatch):
    monkeypatch.setattr(photo_check, "get_classifier", lambda: None)
    db = get_database()
    mid, state = await _photo_round(api_client, inspect=False)
    task = await handle_message(db, "devices/rover-01/mission/state", state)
    assert task is not None
    await task
    photo = next(p for p in (await api_client.get("/api/v1/photos")).json()["photos"] if p["missionId"] == mid)
    assert (photo["treeRow"], photo["treeCol"], photo["tree"]) == (1, 2, "R2 T3")
    cell = (await api_client.get("/api/v1/missions/live")).json()["mission"]["cells"][0]
    assert cell["check"]["status"] == "unavailable" and "OLLAMA_MODEL" in cell["check"]["problem"]

    # a simulated round's camera draws squares: its photos are not checked or kept
    live.__init__()
    _, sim_state = await _photo_round(api_client, inspect=True, simulated=True)
    assert await handle_message(db, "devices/rover-01/mission/state", sim_state) is None


class FakeModel:
    def classify(self, data, guide):
        return photo_check.Seen("early_blight", None, "brown rings on a lower leaf", "pest_damage")


@pytest.mark.asyncio
async def test_plant_inspection_live_then_stored(api_client, sent, monkeypatch):
    monkeypatch.setattr(photo_check, "get_classifier", lambda: FakeModel())
    db = get_database()
    mid, state = await _photo_round(api_client, inspect=True)
    await (await handle_message(db, "devices/rover-01/mission/state", state))

    live_view = (await api_client.get("/api/v1/inspections/g1")).json()
    assert live_view["live"] is True and live_view["inspect"] is True
    plant = next(p for p in live_view["plants"] if (p["row"], p["col"]) == (1, 2))
    assert plant["finding"]["label"] == "early_blight" and plant["finding"]["kind"] == "disease"
    assert plant["finding"]["also"] and plant["finding"]["card"]["steps"]
    assert live_view["summary"]["disease"] == 1 and live_view["summary"]["problems"] == 1

    # the report arrives: the stored round now answers, with the finding read back from the saved photo
    await handle_message(db, "devices/rover-01/mission/result", {
        "missionId": mid, "zoneId": "g1", "status": "completed", "simulated": False, "inspect": True,
        "grid": {"rows": 4, "cols": 4, "cellM": 3.0, "rowM": 3.0},
        "cells": [{"row": 1, "col": 2, "plant": True, "flagged": False, "canopy": 0.4, "chlorosis": 0.2, "readings": {"soil_moisture": 55.0}}]})
    live.__init__()
    stored = (await api_client.get("/api/v1/inspections/g1")).json()
    assert stored["live"] is False and stored["missionId"] == mid
    assert next(p for p in stored["plants"] if (p["row"], p["col"]) == (1, 2))["finding"]["label"] == "early_blight"
    # the round's averages also went into the bed's history
    tel = (await api_client.get("/api/v1/telemetry/g1?metrics=soil_moisture&hours=24")).json()
    assert any(abs(p["v"] - 55.0) < 1e-6 for p in tel["series"]["soil_moisture"])
    assert (await api_client.get("/api/v1/inspections/nope")).status_code == 404


@pytest.mark.asyncio
async def test_the_photo_check_endpoint_uses_the_model(api_client, monkeypatch):
    monkeypatch.setattr(photo_check, "get_classifier", lambda: FakeModel())
    res = (await api_client.post("/api/v1/photos/check?zone=g1", files={"photo": ("leaf.png", PNG, "image/png")})).json()
    assert res["status"] == "ok" and res["label"] == "early_blight"
    assert [m["id"] for m in res["matches"]] == ["early_blight", "pest_damage"]
    assert res["correlation"]["source"] == "photo"


@pytest.mark.asyncio
async def test_rover_test_reports_the_boards_and_jogs_the_wheels(api_client):
    db = get_database()
    assert (await api_client.get("/api/v1/rover/test")).json()["rover"]["status"] == "unknown"
    refused = await api_client.post("/api/v1/rover/test/move", json={"move": "forward"})
    assert refused.status_code == 409 and "offline" in refused.json()["detail"]

    await handle_message(db, "devices/rover-01/status", {"device": "ROVER-01", "status": "online", "fw": "rover-mc-2.1.0",
                                                         "ip": "10.0.0.5", "rssi": -61, "mqttDrive": True, "estop": False})
    await handle_message(db, "devices/rover-01/camera/status", {"status": "online", "url": "http://cam/jpg", "camera": True})
    status = (await api_client.get("/api/v1/rover/test")).json()
    assert status["rover"]["wifiDriving"] is True and status["camera"]["url"] == "http://cam/jpg"

    frames: list[str] = []

    async def esp32(topic: str, text: str) -> None:
        """A rover that answers: ACK at once, DONE when the move has run."""
        frames.append(text)
        fields = parse(text)
        if fields and fields[0] == "DRV":
            loop = asyncio.get_running_loop()
            loop.call_soon(tester.on_evt, frame("ACK", fields[1]))
            loop.call_soon(tester.on_evt, frame("DONE", fields[1], "elapsed"))

    app.dependency_overrides[rover_test_router.get_sender] = lambda: esp32
    moved = (await api_client.post("/api/v1/rover/test/move", json={"move": "left"})).json()
    assert moved["ok"] is True and moved["result"] == "elapsed"
    assert parse(frames[-1])[0] == "DRV"
    assert (await api_client.post("/api/v1/rover/test/stop")).json() == {"stopped": True}
    assert parse(frames[-1])[0] == "STOP"

    async def camera(url: str) -> bytes:
        assert url == "http://cam/jpg"
        return JPEG

    app.dependency_overrides[rover_test_router.get_camera] = lambda: camera
    photo = await api_client.get("/api/v1/rover/test/photo")
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg" and photo.content == JPEG
