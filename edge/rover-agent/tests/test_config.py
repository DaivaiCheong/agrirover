"""The rover's settings on the Pi: calibration, the battery stop, and its own .env file."""
import pytest

from rover.__main__ import main
from rover.camera import NoCamera
from rover.config import RoverConfig, load_env_file
from rover.planner import Cell
from rover.vision import DEFAULT_CALIBRATION, analyze

KEYS = ("ROVER_PWM_CRUISE", "ROVER_MPS_AT_CRUISE", "ROVER_DPS_AT_CRUISE", "ROVER_BATTERY_MIN_V", "MQTT_HOST")


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)


def test_defaults_until_the_rover_is_calibrated():
    cfg = RoverConfig.from_env()
    assert (cfg.calibration.pwm_cruise, cfg.calibration.mps_at_cruise, cfg.calibration.dps_at_cruise) == (150, 0.20, 45.0)
    assert cfg.guard.battery_min_v == 11.1


def test_calibration_and_battery_stop_come_from_the_env_file(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# measured 27 Nov\nROVER_PWM_CRUISE=170\nROVER_MPS_AT_CRUISE = 0.31 # on tiles\n"
                   'ROVER_DPS_AT_CRUISE="88.5"\nROVER_BATTERY_MIN_V=6.6\nMQTT_HOST=192.168.1.20\nnot a setting\n', encoding="utf-8")
    monkeypatch.setenv("MQTT_HOST", "10.0.0.5")                    # already set: the file does not override it
    added = load_env_file(str(env))
    assert "MQTT_HOST" not in added and "ROVER_PWM_CRUISE" in added
    cfg = RoverConfig.from_env()
    assert (cfg.calibration.pwm_cruise, cfg.calibration.mps_at_cruise, cfg.calibration.dps_at_cruise) == (170, 0.31, 88.5)
    assert cfg.guard.battery_min_v == 6.6 and cfg.mqtt_host == "10.0.0.5"
    for key in added:
        monkeypatch.delenv(key)


def test_no_env_file_is_fine(tmp_path):
    assert load_env_file(str(tmp_path / "missing.env")) == []


def test_without_a_camera_every_stop_reads_no_plant():
    obs = analyze(NoCamera().capture(Cell(0, 0)), DEFAULT_CALIBRATION)
    assert obs.plant is False and obs.flagged is False


@pytest.mark.parametrize("argv", [["jog", "forward", "0"], ["jog", "forward", "5"], ["jog", "turn", "0"], ["jog", "turn", "400"]])
def test_jog_refuses_a_move_it_should_not_make(argv):
    with pytest.raises(SystemExit):
        main(argv)
