"""Test the real rover from the Rover page: jog the wheels, take a photo, see what each board reports.

The API talks to the rover's boards directly for these tests, without rover-brain:
    devices/rover-01/status         the ESP32's own status (fw, ip, Wi-Fi signal, whether it accepts Wi-Fi driving)
    devices/rover-01/drive/cmd      one short move, in the motor controller's own frame: $DRV,seq,left,right,ms*XX
    devices/rover-01/drive/evt      its answers: ACK, NAK (with the reason), DONE, BAT
    devices/rover-01/camera/status  the ESP32-CAM: ip, photo URL, whether its camera started
Every limit still lives in the firmware: a test move is short (0.6 s) and slow (PWM 150 of 255), and the ESP32 caps
any move at 1.5 s whatever it is sent. Design: docs/architecture/rover-esp32.md.
"""
from __future__ import annotations

import asyncio
import itertools
import random
import time
from dataclasses import dataclass, field

TOPIC_CMD = "devices/rover-01/drive/cmd"
TOPIC_EVT = "devices/rover-01/drive/evt"
TOPIC_CAMERA_STATUS = "devices/rover-01/camera/status"

TEST_PWM = 150
MOVES = {                                  # left PWM, right PWM, ms
    "forward": (TEST_PWM, TEST_PWM, 600),
    "back": (-TEST_PWM, -TEST_PWM, 600),
    "left": (-TEST_PWM, TEST_PWM, 500),     # on the spot
    "right": (TEST_PWM, -TEST_PWM, 500),
}
ACK_TIMEOUT_S = 2.0
NAK_TEXT = {
    "mqtt_drive_off": "The rover's firmware does not accept moves over Wi-Fi (MQTT_DRIVE is 0 in its secrets.h).",
    "estop": "E-stop is engaged on the rover. Release it first.",
    "bumper": "The bumper is pressed.",
    "bad_checksum": "The rover received a damaged command.",
    "bad_frame": "The rover did not understand the command.",
}


class NotNow(Exception):
    """A test that must not run now; the message says why, for the page."""


def checksum(body: str) -> str:
    c = 0
    for ch in body.encode("ascii"):
        c ^= ch
    return f"{c:02X}"


def frame(*fields: object) -> str:
    body = ",".join(str(f) for f in fields)
    return f"${body}*{checksum(body)}"


def parse(line: str) -> list[str] | None:
    """`$ACK,12*55` -> ["ACK", "12"]; None for anything damaged."""
    line = line.strip()
    if len(line) < 4 or line[0] != "$" or line[-3] != "*":
        return None
    body = line[1:-3]
    return body.split(",") if checksum(body) == line[-2:].upper() else None


@dataclass
class _Waiting:
    ack: asyncio.Future
    done: asyncio.Future


@dataclass
class RoverTest:
    rover: dict = field(default_factory=dict)       # last devices/rover-01/status from the ESP32 itself
    camera: dict = field(default_factory=dict)      # last devices/rover-01/camera/status
    battery_v: float | None = None
    rover_at: float | None = None
    camera_at: float | None = None
    last_move: dict | None = None
    _seq: itertools.count = field(default_factory=lambda: itertools.count(random.randint(100_000, 900_000)))
    _waiting: dict[int, _Waiting] = field(default_factory=dict)
    _lock: asyncio.Lock | None = None

    # ---- what the boards say ------------------------------------------------------------------------------------
    def on_rover_status(self, payload: object) -> None:
        if isinstance(payload, dict) and payload.get("device") == "ROVER-01":
            self.rover, self.rover_at = payload, time.time()

    def on_camera_status(self, payload: object) -> None:
        if isinstance(payload, dict):
            self.camera, self.camera_at = payload, time.time()

    def on_evt(self, text: str) -> None:
        f = parse(text)
        if not f:
            return
        if f[0] == "BAT" and len(f) == 2 and f[1].isdigit():
            self.battery_v = int(f[1]) / 1000.0
            return
        if len(f) < 2 or not f[1].isdigit():
            return
        w = self._waiting.get(int(f[1]))
        if w is None:
            return
        if f[0] in ("ACK", "NAK") and not w.ack.done():
            w.ack.set_result(f)
        elif f[0] == "DONE" and not w.done.done():
            w.done.set_result(f[2] if len(f) > 2 else "unknown")

    def snapshot(self) -> dict:
        cam = self.camera
        return {
            "rover": {"status": self.rover.get("status", "unknown"), "fw": self.rover.get("fw"), "ip": self.rover.get("ip"),
                      "rssi": self.rover.get("rssi"), "wifiDriving": self.rover.get("mqttDrive"),
                      "estop": self.rover.get("estop"), "batteryV": self.battery_v,
                      # the motor pins the firmware drives (rover-mc-2.1.0 on): "L:32,33,25;L:13,26,27;..." as en,fwd,back
                      "pins": self.rover.get("pins"), "pinsSaved": self.rover.get("pinsSaved")},
            "camera": {"status": cam.get("status", "unknown"), "ip": cam.get("ip"), "url": cam.get("url"),
                       "sensor": cam.get("camera"), "size": cam.get("size"), "rssi": cam.get("rssi"), "fw": cam.get("fw")},
            "lastMove": self.last_move,
        }

    # ---- a test move ----------------------------------------------------------------------------------------------
    def refuse_move(self, *, round_running: bool, estop: bool) -> str | None:
        if round_running:
            return "The rover is on a round. Test moves wait until it ends."
        if estop or self.rover.get("estop") is True:
            return "E-stop is engaged. Release it first."
        if self.rover.get("status") != "online":
            return "The rover is offline: no ESP32 on the broker."
        if self.rover.get("mqttDrive") is False:
            return NAK_TEXT["mqtt_drive_off"]
        return None

    async def move(self, name: str, send, *, round_running: bool = False, estop: bool = False) -> dict:
        """One short move. `send(topic, text)` publishes a raw frame. Returns what the rover reported."""
        if name not in MOVES:
            raise NotNow(f"unknown move {name!r}; choose one of {', '.join(MOVES)}")
        why = self.refuse_move(round_running=round_running, estop=estop)
        if why:
            raise NotNow(why)
        self._lock = self._lock or asyncio.Lock()
        if self._lock.locked():
            raise NotNow("A test move is already running.")
        async with self._lock:
            left, right, ms = MOVES[name]
            seq = next(self._seq)
            loop = asyncio.get_running_loop()
            w = _Waiting(loop.create_future(), loop.create_future())
            self._waiting[seq] = w
            t0 = time.monotonic()
            try:
                await send(TOPIC_CMD, frame("DRV", seq, left, right, ms))
                try:
                    ack = await asyncio.wait_for(w.ack, ACK_TIMEOUT_S)
                except asyncio.TimeoutError:
                    result = {"move": name, "ok": False, "result": "no_answer",
                              "text": "The rover did not answer within 2 s: is it on Wi-Fi?"}
                else:
                    ack_ms = round((time.monotonic() - t0) * 1000)
                    if ack[0] == "NAK":
                        reason = ack[2] if len(ack) > 2 else "unknown"
                        result = {"move": name, "ok": False, "result": reason, "ackMs": ack_ms,
                                  "text": NAK_TEXT.get(reason, f"The rover refused: {reason}.")}
                    else:
                        try:
                            reason = await asyncio.wait_for(w.done, ms / 1000 + 2.0)
                        except asyncio.TimeoutError:
                            reason = "no_done"
                        ok = reason == "elapsed"
                        result = {"move": name, "ok": ok, "result": reason, "ackMs": ack_ms, "ms": ms,
                                  "text": f"Moved {name} for {ms / 1000:.1f} s; the rover answered in {ack_ms} ms." if ok
                                  else f"The move ended early: {reason}."}
            finally:
                self._waiting.pop(seq, None)
            self.last_move = {**result, "at": time.time()}
            return result

    async def stop(self, send) -> None:
        await send(TOPIC_CMD, frame("STOP", next(self._seq)))

    # ---- a test photo -------------------------------------------------------------------------------------------
    def camera_url(self, fallback: str | None = None) -> str:
        if self.camera.get("status") == "offline":
            raise NotNow("The rover camera is offline: not on Wi-Fi or unplugged.")
        if self.camera.get("camera") is False:
            raise NotNow("The camera board is on Wi-Fi, but its camera module does not answer: "
                              "check the ribbon cable, or replace the OV2640 module.")
        url = self.camera.get("url") or fallback
        if not url:
            raise NotNow("No rover camera has reported in yet.")
        return url


tester = RoverTest()
