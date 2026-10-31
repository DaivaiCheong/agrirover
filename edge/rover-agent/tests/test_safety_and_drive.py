import pytest

from rover import protocol
from rover.config import DriveLimits, GuardLimits
from rover.drive import Pose, SerialDrive, SimDrive
from rover.safety import Guards, SafetyStop, split_duration

LIMITS = DriveLimits()


@pytest.mark.parametrize("total,maximum", [(2500, 1500), (1500, 1500), (1, 1500), (10_001, 1500)])
def test_split_duration_respects_firmware_limit(total, maximum):
    parts = split_duration(total, maximum)
    assert sum(parts) == total
    assert all(0 < p <= maximum for p in parts)
    assert max(parts) - min(parts) <= 1


@pytest.mark.parametrize("guards,reason", [
    (Guards(estop=True), "estop"),
    (Guards(link_ok=False), "link_lost"),
    (Guards(rain=True), "rain"),
    (Guards(battery_v=10.5), "battery_low"),
])
def test_each_guard_stops_the_rover(guards, reason):
    with pytest.raises(SafetyStop) as exc:
        guards.check(GuardLimits())
    assert exc.value.reason == reason


def test_clear_guards_pass():
    Guards(battery_v=12.4).check(GuardLimits())


def test_geofence_refuses_to_leave_the_bed():
    drive = SimDrive(LIMITS, Pose(0.25, 0.25, 180.0), fence=(2.0, 1.0))   # facing west, at the edge
    with pytest.raises(SafetyStop, match="geofence"):
        drive.forward(0.5)
    assert drive.pose == Pose(0.25, 0.25, 180.0)                          # did not move


def test_sim_drive_refuses_long_steps():
    with pytest.raises(SafetyStop):
        SimDrive(LIMITS, Pose(0, 0)).forward(LIMITS.max_step_m + 0.1)


class FakeController:
    """Stands in for the motor controller on the serial port."""

    def __init__(self, reply=("ACK", "DONE"), done_reason="elapsed", battery_mv=12300):
        self.sent: list[str] = []
        self._rx: list[bytes] = []
        self.reply, self.done_reason, self.battery_mv = reply, done_reason, battery_mv

    def write(self, data: bytes) -> None:
        line = data.decode()
        self.sent.append(line)
        fields = protocol.parse(line)
        seq = fields[1]
        if fields[0] == "DRV":
            self._rx.append(protocol.frame("BAT", self.battery_mv).encode())
            if "NAK" in self.reply:
                self._rx.append(protocol.frame("NAK", seq, "bumper").encode())
                return
            if "ACK" in self.reply:
                self._rx.append(protocol.frame("ACK", seq).encode())
            if "DONE" in self.reply:
                self._rx.append(protocol.frame("DONE", seq, self.done_reason).encode())

    def readline(self) -> bytes:
        return self._rx.pop(0) if self._rx else b""


def ticking_clock(step=0.01):
    t = [0.0]

    def clock():
        t[0] += step
        return t[0]
    return clock


def test_serial_drive_splits_runs_into_firmware_sized_segments():
    ctl = FakeController()
    drive = SerialDrive(LIMITS, ser=ctl, mps_at_cruise=0.2, clock=ticking_clock())
    drive.forward(0.5)                                   # 2.5 s at 0.2 m/s
    drv = [protocol.parse(s) for s in ctl.sent if s.startswith("$DRV")]
    assert [int(f[4]) for f in drv] == [1250, 1250]
    assert all(int(f[2]) == int(f[3]) > 0 for f in drv)  # straight, forwards
    assert drive.battery_v() == pytest.approx(12.3)


def test_serial_drive_left_turn_spins_wheels_opposite():
    ctl = FakeController()
    SerialDrive(LIMITS, ser=ctl, clock=ticking_clock()).turn(90)
    left, right = (int(x) for x in protocol.parse(ctl.sent[0])[2:4])
    assert left < 0 < right


def test_serial_drive_never_exceeds_speed_cap():
    ctl = FakeController()
    drive = SerialDrive(LIMITS, ser=ctl, pwm_cruise=200, mps_at_cruise=0.6, clock=ticking_clock())
    drive.forward(0.3)
    total_ms = sum(int(protocol.parse(s)[4]) for s in ctl.sent if s.startswith("$DRV"))
    assert 0.3 / (total_ms / 1000) <= LIMITS.max_speed_mps + 1e-9


@pytest.mark.parametrize("ctl,reason", [
    (FakeController(reply=("NAK",)), "controller_nak:bumper"),
    (FakeController(done_reason="bumper"), "controller_bumper"),
    (FakeController(reply=()), "controller_timeout"),
])
def test_serial_drive_faults_end_the_mission(ctl, reason):
    with pytest.raises(SafetyStop) as exc:
        SerialDrive(LIMITS, ser=ctl, clock=ticking_clock(0.05)).forward(0.2)
    assert exc.value.reason == reason
