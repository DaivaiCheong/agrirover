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
    trees = [r for r in report.results if r.obs.plant]
    assert all(r.readings["soil_moisture"] >= 0 for r in trees)        # every tree seen was probed
    assert all(r.readings == {} for r in report.results if not r.obs.plant)   # no tree, the probe stays up


def test_a_reused_drive_reports_each_mission_separately():
    runner, _ = sim_runner(CFG, spec(1, 4), seed=5, guards=Guards())
    first = runner.run(spec(1, 4))
    runner.drive.pose = runner.drive.pose.__class__(0.25, 0.25, 0.0)   # rover put back on cell (0, 0)
    second = runner.run(spec(1, 4, mission="m-2"))
    assert first.distance_m == pytest.approx(1.5) and second.distance_m == pytest.approx(1.5)


def test_low_battery_stops_with_a_partial_report():
    runner, _ = sim_runner(CFG, spec(4, 10), seed=5, guards=Guards(), battery_v=11.12)
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
    {"missionId": "a", "zoneId": "z", "rows": 2, "cols": 2, "cellM": 11},
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


# ---- the live simulation: what the farm server and the screen rely on

from rover.__main__ import live_sim_runner                     # noqa: E402
from rover.mission import SimOptions                           # noqa: E402


def sim_spec(rows=4, cols=5, **sim):
    return MissionSpec("m-live", "zone-a", rows, cols, 0.5, SimOptions(**{"seed": 3, "speedup": 0, **sim}))


def test_progress_tells_the_watcher_what_each_cell_showed():
    seen = []
    report = live_sim_runner(CFG, sim_spec(), Guards()).run(sim_spec(), seen.append)
    assert report.status == "completed" and report.simulated is True
    assert seen[0]["cell"] is None and "observation" not in seen[0]
    assert [s["cellsScanned"] for s in seen] == list(range(21))
    last = seen[-1]
    assert (last["rows"], last["cols"], last["zoneId"], last["simulated"]) == (4, 5, "zone-a", True)
    assert last["observation"]["row"] == last["cell"][0] and last["observation"]["col"] == last["cell"][1]
    assert isinstance(last["frame"], str) and len(last["frame"]) < 8000    # small enough to send for every cell
    assert 11.1 < last["battery"] < 12.6
    json.dumps(last)                                                       # it must survive MQTT


def test_scripted_rain_ends_the_survey_through_the_normal_stop():
    s = sim_spec(rain_at_cell=8)
    runner = live_sim_runner(CFG, s, Guards())
    report = runner.run(s)
    assert (report.status, report.abort_reason, report.cells_scanned) == ("aborted", "rain", 7)
    assert runner.drive.stops == 1


def test_low_battery_stops_the_rover_where_the_server_expects():
    # the server sets this so the guard trips about 40 % along a 20-tree block: 11.1 + 0.005 V/m x 0.5 m x 8 trees
    s = sim_spec(battery_v=11.12)
    report = live_sim_runner(CFG, s, Guards()).run(s)
    assert (report.status, report.abort_reason) == ("aborted", "battery_low")
    assert 7 <= report.cells_scanned <= 10


def test_a_seed_gives_the_same_field_and_another_seed_a_different_one():
    def needs(seed):
        s = sim_spec(seed=seed)
        return [(r.row, r.col, r.readings.get("soil_moisture")) for r in live_sim_runner(CFG, s, Guards()).run(s).results]
    assert needs(3) == needs(3)
    assert needs(3) != needs(4)


@pytest.mark.parametrize("sim", [
    "rain", {"base": "x"}, {"base": {"soil_ec": "wet"}}, {"moistureSpread": 500}, {"seed": -1}, {"seed": 1.5}, {"seed": True}, {"rainAtCell": 0}, {"rainAtCell": 401},
    {"batteryV": 20}, {"batteryV": "12"}, {"batteryV": True}, {"speedup": 0}, {"speedup": 1000},
])
def test_bad_simulation_options_are_refused(sim):
    with pytest.raises(ValueError):
        MissionSpec.from_payload({"missionId": "m", "zoneId": "z", "rows": 2, "cols": 2, "sim": sim}, DriveLimits())


def test_a_plain_mission_has_no_simulation_options():
    assert MissionSpec.from_payload({"missionId": "m", "zoneId": "z", "rows": 2, "cols": 2}, DriveLimits()).sim is None


def test_the_real_runner_is_not_marked_simulated():
    from rover.camera import SimCamera, SimField
    from rover.drive import Pose, SimDrive
    from rover.mission import MissionRunner
    s = MissionSpec("m", "z", 1, 2, 0.5)
    runner = MissionRunner(CFG, SimDrive(CFG.drive, Pose(0.25, 0.25)), SimCamera(SimField(1, 2)), Guards())
    assert runner.run(s).simulated is False


def test_the_rover_announces_its_estop_so_a_server_restart_cannot_forget_it():
    class FakeClient:
        def __init__(self):
            self.sent = []

        async def publish(self, topic, payload, qos=0, retain=False):
            self.sent.append((topic, json.loads(payload), retain))

    guards = Guards()
    link = RoverLink(CFG, lambda s: None, guards)
    link._client = FakeClient()
    asyncio.run(link.handle(CFG.topic_estop, json.dumps({"estop": True})))
    assert guards.estop is True
    topic, payload, retain = link._client.sent[-1]
    assert (topic, payload["status"], payload["estop"], retain) == (CFG.topic_status, "online", True, True)
    asyncio.run(link.handle(CFG.topic_estop, json.dumps({"estop": False})))
    assert guards.estop is False and link._client.sent[-1][1]["estop"] is False


def test_trees_far_apart_are_reached_in_steps_the_drive_accepts():
    from rover.planner import plan, serpentine
    legs = plan(serpentine(2, 2), 3.5, row_m=5.0, max_step_m=1.0)
    forward = [[m.value for m in leg if m.kind == "forward"] for leg in legs]
    assert all(v <= 1.0 for leg in forward for v in leg)
    assert sum(forward[1]) == pytest.approx(3.5) and sum(forward[2]) == pytest.approx(5.0)


def test_a_wide_orchard_round_is_driven_inside_the_fence():
    s = MissionSpec("m-wide", "g1", 4, 4, 5.0, SimOptions(seed=2, speedup=0), row_m=5.0)
    report = live_sim_runner(CFG, s, Guards()).run(s)
    assert report.status == "completed" and report.cells_scanned == 16
    assert report.distance_m == pytest.approx(15 * 5.0)
    assert report.est_duration_s > report.drive_time_s + 40            # stopping at a tree takes time


def test_the_probe_reads_what_the_server_says_to_simulate():
    s = MissionSpec("m-b", "g3", 2, 5, 2.0, SimOptions(seed=1, speedup=0, base={"soil_moisture": 30.0, "soil_ec": 2.9}, moisture_spread=0.0), row_m=3.0)
    report = live_sim_runner(CFG, s, Guards()).run(s)
    trees = [r for r in report.results if r.obs.plant]
    assert all(r.readings["soil_moisture"] == 30.0 for r in trees)
    assert all(2.5 < r.readings["soil_ec"] < 3.3 for r in trees)


def test_a_real_rover_with_no_probe_still_photographs():
    from rover.camera import SimCamera, SimField
    from rover.drive import Pose, SimDrive
    from rover.mission import MissionRunner
    s = MissionSpec("m", "z", 1, 2, 0.5)
    report = MissionRunner(CFG, SimDrive(CFG.drive, Pose(0.25, 0.25)), SimCamera(SimField(1, 2)), Guards()).run(s)
    assert all(r.readings == {} for r in report.results) and report.status == "completed"


def test_a_cell_sends_its_readings_and_nothing_decided_from_the_photo():
    s = sim_spec()
    cell = live_sim_runner(CFG, s, Guards()).run(s).results[0].to_dict()
    assert "readings" in cell and "needs_water" not in cell and "suggested_ml" not in cell and "dryness" not in cell
