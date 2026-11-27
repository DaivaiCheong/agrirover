"""Plant Inspection: a photo of every plant, and turning the forward camera toward plants beside the lane."""
import base64

import numpy as np
import pytest

from rover.__main__ import live_sim_runner, sim_runner
from rover.camera import FolderCamera
from rover.config import DriveLimits, RoverConfig
from rover.mission import MissionSpec
from rover.planner import Cell
from rover.safety import Guards

CFG = RoverConfig()
BASE = {"missionId": "m-inspect", "zoneId": "t1", "rows": 2, "cols": 3, "cellM": 0.5, "rowM": 0.8}


def tomato_row(**extra) -> MissionSpec:
    return MissionSpec.from_payload({**BASE, "stops": [[0, 0], [0, 2], [1, 0], [1, 1]], **extra}, DriveLimits())


class Recorder:
    """Wraps the simulated drive and camera, writing down every turn and capture with the heading at the time."""

    def __init__(self, runner):
        self.events: list[tuple] = []
        drive, camera = runner.drive, runner.camera
        outer = self

        class Drive:
            def __getattr__(self, name):
                return getattr(drive, name)

            def turn(self, degrees):
                before = drive.pose.heading
                drive.turn(degrees)
                outer.events.append(("turn", degrees, before, drive.pose))

        class Camera:
            def capture(self, cell):
                outer.events.append(("capture", cell, drive.pose))
                return camera.capture(cell)

        runner.drive, runner.camera = Drive(), Camera()


@pytest.mark.parametrize("look, angle", [("left", 90.0), ("right", -90.0)])
def test_the_rover_turns_to_the_plant_photographs_it_and_turns_back_in_place(look, angle):
    s = tomato_row(look=look)
    runner, _ = sim_runner(CFG, s, seed=4, guards=Guards())
    rec = Recorder(runner)
    report = runner.run(s)
    assert report.status == "completed", report.abort_reason        # no geofence stop: the turn happens in place
    captures = [i for i, e in enumerate(rec.events) if e[0] == "capture"]
    assert len(captures) == 4
    for i in captures:
        there, capture, back = rec.events[i - 1], rec.events[i], rec.events[i + 1]
        assert there[0] == "turn" and there[1] == angle
        assert back[0] == "turn" and back[1] == -angle
        heading_before = there[2]
        assert capture[2].heading == pytest.approx((heading_before + angle + 180) % 360 - 180)   # facing the plant
        assert back[3].heading == pytest.approx(heading_before)                                  # back along the lane
        assert (back[3].x, back[3].y) == pytest.approx((there[3].x, there[3].y))                 # without moving


def test_look_adds_one_turn_there_and_one_back_per_plant_and_nothing_else():
    def turns(**extra):
        s = tomato_row(**extra)
        runner, _ = sim_runner(CFG, s, seed=4, guards=Guards())
        rec = Recorder(runner)
        report = runner.run(s)
        return [e[1] for e in rec.events if e[0] == "turn"], report

    plain, plain_report = turns()
    looking, looking_report = turns(look="left")
    assert len(looking) == len(plain) + 2 * 4
    assert looking_report.distance_m == pytest.approx(plain_report.distance_m)


def test_an_inspection_round_sends_a_photo_of_every_plant():
    s = MissionSpec("m-inspect", "t1", 4, 6, 0.5, inspect=True)
    runner, _ = sim_runner(CFG, s, seed=5, guards=Guards())
    states: list[dict] = []
    runner.run(s, states.append)
    seen = [st for st in states if "observation" in st]
    assert len(seen) == 24
    assert any(not st["observation"]["flagged"] for st in seen)               # healthy ones too
    assert all(base64.b64decode(st["photo"]).startswith(b"\xff\xd8\xff") for st in seen)
    assert all(st["inspect"] is True and st["look"] is None for st in states)


def test_every_state_message_says_how_the_round_looks():
    s = tomato_row(inspect=True, look="right")
    runner, _ = sim_runner(CFG, s, seed=4, guards=Guards())
    states: list[dict] = []
    runner.run(s, states.append)
    assert states and all(st["inspect"] is True and st["look"] == "right" and st["photosReal"] is False for st in states)


def _write_pictures(folder, colours):
    from PIL import Image
    names = []
    for i, (name, colour) in enumerate(colours):
        Image.new("RGB", (40 + i, 30), colour).save(folder / name)
        names.append(name)
    return names


def test_folder_camera_cycles_through_the_pictures_in_name_order(tmp_path):
    _write_pictures(tmp_path, [("b.png", (0, 0, 255)), ("a.jpg", (255, 0, 0)), ("c.JPEG", (0, 255, 0))])
    (tmp_path / "notes.txt").write_text("not a picture")
    cam = FolderCamera(tmp_path)
    frames = [cam.capture(Cell(0, i)) for i in range(5)]
    assert all(f.dtype == np.uint8 and f.ndim == 3 and f.shape[2] == 3 for f in frames)
    dominant = [int(np.argmax(f.reshape(-1, 3).mean(axis=0))) for f in frames]
    assert dominant == [0, 2, 1, 0, 2]                     # a.jpg (red), b.png (blue), c.JPEG (green), then again
    assert frames[0].shape[:2] == (30, 41)       # a.jpg, as saved


def test_folder_camera_refuses_a_folder_without_pictures(tmp_path):
    with pytest.raises(ValueError):
        FolderCamera(tmp_path)
    with pytest.raises(ValueError):
        FolderCamera(tmp_path / "missing")


def test_a_rehearsal_with_real_photos_marks_every_state_photos_real(tmp_path):
    _write_pictures(tmp_path, [("leaf1.jpg", (60, 140, 50)), ("leaf2.jpg", (200, 185, 60))])
    s = tomato_row(inspect=True, look="left")
    runner = live_sim_runner(CFG, s, Guards(), speedup=0, camera=FolderCamera(tmp_path), photos_real=True)
    states: list[dict] = []
    report = runner.run(s, states.append)
    assert report.status == "completed", report.abort_reason
    assert report.simulated is True                                          # the drive is still simulated
    assert states and all(st["photosReal"] is True for st in states)
    assert sum("photo" in st for st in states) == 4


@pytest.mark.parametrize("extra", [{"look": "up"}, {"look": 90}, {"look": ""}, {"inspect": "yes"}, {"inspect": 1},
                                   {"inspect": None}])
def test_bad_inspection_options_are_refused(extra):
    with pytest.raises(ValueError):
        MissionSpec.from_payload({**BASE, **extra}, DriveLimits())


def test_inspection_options_are_read_from_the_mission():
    s = MissionSpec.from_payload({**BASE, "inspect": True, "look": "left"}, DriveLimits())
    assert s.inspect is True and s.look == "left"
    plain = MissionSpec.from_payload(BASE, DriveLimits())
    assert plain.inspect is False and plain.look is None


def test_photos_needs_the_simulated_rover():
    from rover.__main__ import main
    with pytest.raises(SystemExit):
        main(["run", "--photos", "x"])
