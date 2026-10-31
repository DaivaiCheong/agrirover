import asyncio
import json
from xml.etree import ElementTree

import pytest

from rover.__main__ import sim_runner
from rover.config import DriveLimits, RoverConfig
from rover.link import RoverLink, estop_requested, rain_from_telemetry
from rover.mission import MissionSpec
from rover.report import field_map_svg, save_report
from rover.safety import Guards

CFG = RoverConfig()


def spec(rows=3, cols=6, mission="m-1", zone="zone-a"):
    return MissionSpec(mission, zone, rows, cols, 0.5)


def test_completed_survey_matches_the_plan():
    runner, _ = sim_runner(CFG, spec(), seed=5, guards=Guards())
    report = runner.run(spec())
    assert report.status == "completed"
    assert report.cells_scanned == 18
    assert report.distance_m == pytest.approx(17 * 0.5)
    assert runner.drive.stops == 1                       # always ends stopped
    assert all(t["ml"] > 0 for t in report.watering_targets)
    assert len(report.watering_targets) == report.plants_needing_water


def test_a_reused_drive_reports_each_mission_separately():
    runner, _ = sim_runner(CFG, spec(1, 4), seed=5, guards=Guards())
    first = runner.run(spec(1, 4))
    runner.drive.pose = runner.drive.pose.__class__(0.25, 0.25, 0.0)   # rover put back on cell (0, 0)
    second = runner.run(spec(1, 4, mission="m-2"))
    assert first.distance_m == pytest.approx(1.5) and second.distance_m == pytest.approx(1.5)


def test_low_battery_stops_with_a_partial_report():
    runner, _ = sim_runner(CFG, spec(4, 10), seed=5, guards=Guards(), battery_v=11.25)
    report = runner.run(spec(4, 10))
    assert report.status == "aborted" and report.abort_reason == "battery_low"
    assert 0 < report.cells_scanned < 40
    assert runner.drive.stops == 1


def test_estop_mid_mission():
    guards = Guards()
    runner, _ = sim_runner(CFG, spec(), seed=5, guards=guards)

    def press_estop_after_five(state):
        if state["cellsScanned"] == 5:
            guards.estop = True

    report = runner.run(spec(), on_progress=press_estop_after_five)
    assert report.status == "aborted" and report.abort_reason == "estop"
    assert report.cells_scanned == 5


def test_camera_fault_is_reported_not_raised():
    runner, _ = sim_runner(CFG, spec(), seed=5, guards=Guards())

    class BrokenCamera:
        def capture(self, cell):
            raise RuntimeError("camera read failed")

    runner.camera = BrokenCamera()
    report = runner.run(spec())
    assert report.status == "failed" and report.abort_reason == "error:RuntimeError"
    assert runner.drive.stops == 1


@pytest.mark.parametrize("payload", [
    {"missionId": "a", "zoneId": "z", "rows": 0, "cols": 3},
    {"missionId": "a", "zoneId": "z", "rows": 30, "cols": 30},
    {"missionId": "a", "zoneId": "z", "rows": 2, "cols": 2, "cellM": 5},
    {"missionId": "../etc", "zoneId": "z", "rows": 2, "cols": 2},
    {"missionId": "a", "zoneId": "z", "rows": "2", "cols": 2},
    {"zoneId": "z", "rows": 2, "cols": 2},
    ["not", "an", "object"],
])
def test_invalid_missions_are_refused(payload):
    with pytest.raises(ValueError):
        MissionSpec.from_payload(payload, DriveLimits())


def test_report_files(tmp_path):
    runner, _ = sim_runner(CFG, spec(zone="<bed & 1>"), seed=5, guards=Guards())
    report = runner.run(spec(zone="<bed & 1>"))
    paths = save_report(report, tmp_path)
    data = json.loads(paths["json"].read_text())
    assert data["cellsScanned"] == 18 and len(data["cells"]) == 18
    ElementTree.fromstring(field_map_svg(report))       # well-formed, zone name escaped


def test_rain_and_estop_parsing():
    batch = {"measurements": [{"metric": "soil_moisture", "value": 31.0}, {"metric": "rain", "value": 1}]}
    assert rain_from_telemetry(batch) is True
    assert rain_from_telemetry({"metric": "rain", "value": 0}) is False
    assert rain_from_telemetry({"metric": "soil_moisture", "value": 5}) is None
    assert estop_requested({"estop": True}) and estop_requested("stop") and estop_requested(42)
    assert not estop_requested({"estop": False}) and not estop_requested("release")


class FakeClient:
    def __init__(self):
        self.published: list[tuple[str, dict, bool]] = []

    async def publish(self, topic, payload, qos=0, retain=False):
        await asyncio.sleep(0.002)          # a real broker round-trip takes time
        self.published.append((topic, json.loads(payload), retain))


def test_link_runs_a_mission_end_to_end(tmp_path):
    cfg = RoverConfig(report_dir=str(tmp_path))
    guards = Guards()
    link = RoverLink(cfg, lambda s: sim_runner(cfg, s, 5, guards)[0], guards)
    client = FakeClient()
    link._client = client

    async def scenario():
        await link.handle(cfg.topic_mission_set,
                          json.dumps({"missionId": "m-42", "zoneId": "zone-a", "rows": 2, "cols": 4}).encode())
        await link.handle(cfg.topic_mission_set,                       # second request while busy
                          json.dumps({"missionId": "m-43", "zoneId": "zone-a", "rows": 2, "cols": 4}).encode())
        await link._task

    asyncio.run(scenario())
    states = [p for t, p, _ in client.published if t == cfg.topic_mission_state]
    results = [p for t, p, _ in client.published if t == cfg.topic_mission_result]
    assert {"missionId": "m-43", "status": "rejected", "reason": "busy"} in states
    assert any(s.get("status") == "running" for s in states)
    assert states[-1]["status"] == "completed" and states[-1]["cellsScanned"] == 8   # final state last
    assert [s["cellsScanned"] for s in states if s.get("status") == "running"] == list(range(9))
    assert results and results[0]["missionId"] == "m-42"
    assert (tmp_path / "m-42" / "report.json").exists()


def test_link_rain_from_any_zone_blocks_until_all_dry():
    guards = Guards()
    link = RoverLink(CFG, lambda s: None, guards)
    wet = json.dumps({"measurements": [{"metric": "rain", "value": 1}]})
    dry = json.dumps({"measurements": [{"metric": "rain", "value": 0}]})

    async def scenario():
        await link.handle("farm/farm-01/zone/zone-a/telemetry", wet)
        await link.handle("farm/farm-01/zone/zone-b/telemetry", dry)
        assert guards.rain
        await link.handle("farm/farm-01/zone/zone-a/telemetry", dry)
        assert not guards.rain

    asyncio.run(scenario())
