import numpy as np
import pytest

from rover.camera import SimCamera, SimField
from rover.planner import Cell
from rover.vision import Calibration, analyze


def frame(colour, size=64):
    img = np.empty((size, size, 3), np.uint8)
    img[:] = colour
    return img


def test_bare_dry_soil():
    obs = analyze(frame((175, 145, 105)))
    assert not obs.plant and not obs.needs_water and not obs.flagged
    assert obs.dryness == pytest.approx(1.0, abs=0.02)


def test_bare_wet_soil():
    assert analyze(frame((90, 65, 45))).dryness == pytest.approx(0.0, abs=0.02)


def test_plant_on_dry_soil_needs_water():
    img = frame((175, 145, 105))
    img[16:48, 16:48] = (55, 135, 50)
    obs = analyze(img)
    assert obs.plant and obs.needs_water
    assert obs.canopy == pytest.approx(0.25, abs=0.01)
    assert 0 < obs.suggested_ml <= Calibration().max_water_ml


def test_plant_on_wet_soil_does_not():
    img = frame((95, 70, 48))
    img[16:48, 16:48] = (55, 135, 50)
    assert not analyze(img).needs_water


def test_yellowing_is_flagged_but_dry_soil_is_not():
    img = frame((175, 145, 105))
    img[16:48, 16:48] = (55, 135, 50)
    img[20:30, 20:30] = (205, 185, 60)                   # 100 of 1024 leaf pixels
    obs = analyze(img)
    assert obs.flagged and obs.chlorosis == pytest.approx(100 / 1024, abs=0.01)
    healthy = frame((175, 145, 105))
    healthy[16:48, 16:48] = (55, 135, 50)
    assert not analyze(healthy).flagged


def test_rejects_non_rgb():
    with pytest.raises(ValueError):
        analyze(np.zeros((10, 10), np.uint8))


def test_agrees_with_simulated_ground_truth():
    field = SimField(8, 10, seed=3)
    cam = SimCamera(field)
    cells = [Cell(r, c) for r in range(8) for c in range(10)]
    obs = [analyze(cam.capture(c)) for c in cells]
    truth = [field.truth(c) for c in cells]
    n = len(cells)
    assert sum(o.plant == t.plant for o, t in zip(obs, truth)) / n == 1.0
    assert sum(o.needs_water == t.needs_water for o, t in zip(obs, truth)) / n >= 0.9
    assert sum(o.flagged == (t.chlorosis > 0) for o, t in zip(obs, truth)) / n >= 0.95
