"""Rover › Test: test moves and test photos against a fake ESP32 that answers like the real firmware."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import rover_test as router
from app.services import rover_test as svc

from app.services.rover_test import RoverTest, NotNow, frame, parse

ONLINE = {"status": "online", "device": "ROVER-01", "fw": "rover-mc-2.0.0", "ip": "192.168.1.11", "rssi": -60,
          "estop": False, "mqttDrive": True}


def esp32(tester: RoverTest, *, nak: str | None = None, done: str = "elapsed", answer: bool = True):
    """A sender that plays the rover: every DRV is acknowledged (or refused), then reported done."""
    sent = []

    async def send(topic, text):
        sent.append((topic, text))
        f = parse(text)
        if not answer or f[0] != "DRV":
            return
        seq = f[1]
        loop = asyncio.get_running_loop()
        if nak:
            loop.call_soon(tester.on_evt, frame("NAK", seq, nak))
        else:
            loop.call_soon(tester.on_evt, frame("ACK", seq))
            loop.call_later(0.01, tester.on_evt, frame("DONE", seq, done))
    return send, sent


def test_frames_match_the_firmware():
    assert frame("DRV", 12, 150, 150, 1200) == "$DRV,12,150,150,1200*40"     # rover/protocol.py gives the same
    assert parse("$ACK,101*55") == ["ACK", "101"]
    assert parse("$ACK,101*56") is None and parse("hello") is None


def test_a_move_is_sent_once_acknowledged_and_finished():
    t = RoverTest()
    t.on_rover_status(ONLINE)
    send, sent = esp32(t)
    r = asyncio.run(t.move("left", send))
    assert r["ok"] and r["result"] == "elapsed" and r["ms"] == 500
    (topic, text), = sent
    f = parse(text)
    assert topic == svc.TOPIC_CMD and f[0] == "DRV" and f[2:] == ["-150", "150", "500"]


def test_the_firmware_refusing_is_reported_in_words():
    t = RoverTest()
    t.on_rover_status(ONLINE)
    send, _ = esp32(t, nak="bumper")
    r = asyncio.run(t.move("forward", send))
    assert not r["ok"] and r["result"] == "bumper" and "bumper" in r["text"]


def test_no_answer_says_so(monkeypatch):
    monkeypatch.setattr(svc, "ACK_TIMEOUT_S", 0.05)
    t = RoverTest()
    t.on_rover_status(ONLINE)
    send, _ = esp32(t, answer=False)
    assert asyncio.run(t.move("back", send))["result"] == "no_answer"


@pytest.mark.parametrize("status, kwargs, words", [
    ({**ONLINE, "status": "offline"}, {}, "offline"),
    ({**ONLINE, "mqttDrive": False}, {}, "MQTT_DRIVE"),
    ({**ONLINE, "estop": True}, {}, "E-stop"),
    (ONLINE, {"round_running": True}, "round"),
])
def test_moves_are_refused_before_anything_is_sent(status, kwargs, words):
    t = RoverTest()
    t.on_rover_status(status)
    send, sent = esp32(t)
    with pytest.raises(NotNow, match=words):
        asyncio.run(t.move("forward", send, **kwargs))
    assert sent == []


def test_status_from_other_devices_is_ignored_and_battery_is_read():
    t = RoverTest()
    t.on_rover_status({"status": "online", "device": "ESP-FIELD-01"})
    t.on_evt(frame("BAT", 12480))
    s = t.snapshot()
    assert s["rover"]["status"] == "unknown" and s["rover"]["batteryV"] == 12.48


def test_camera_url_explains_a_dead_camera_module():
    t = RoverTest()
    with pytest.raises(NotNow, match="reported"):
        t.camera_url()
    t.on_camera_status({"status": "online", "url": "http://192.168.1.12/capture", "camera": False})
    with pytest.raises(NotNow, match="ribbon"):
        t.camera_url()
    t.on_camera_status({"status": "online", "url": "http://192.168.1.12/capture", "camera": True})
    assert t.camera_url() == "http://192.168.1.12/capture"


@pytest.fixture
def fresh(monkeypatch):
    t = RoverTest()
    monkeypatch.setattr(router, "tester", t)
    yield t
    app.dependency_overrides.clear()


def test_api_move_and_refusal(fresh):
    send, sent = esp32(fresh)
    app.dependency_overrides[router.get_sender] = lambda: send
    c = TestClient(app)
    r = c.post("/api/v1/rover/test/move", json={"move": "forward"})
    assert r.status_code == 409 and "offline" in r.json()["detail"]
    fresh.on_rover_status(ONLINE)
    r = c.post("/api/v1/rover/test/move", json={"move": "forward"})
    assert r.status_code == 200 and r.json()["ok"] is True
    assert c.post("/api/v1/rover/test/move", json={"move": "sideways"}).status_code == 422
    assert c.get("/api/v1/rover/test").json()["lastMove"]["move"] == "forward"


def test_api_photo(fresh):
    jpeg = b"\xff\xd8\xff\xe0fake"

    async def get(url):
        assert url == "http://192.168.1.12/capture"
        return jpeg
    app.dependency_overrides[router.get_camera] = lambda: get
    c = TestClient(app)
    fresh.on_camera_status({"status": "online", "url": "http://192.168.1.12/capture", "camera": False})
    r = c.get("/api/v1/rover/test/photo")
    assert r.status_code == 409 and "camera module" in r.json()["detail"]
    fresh.on_camera_status({"status": "online", "url": "http://192.168.1.12/capture", "camera": True})
    r = c.get("/api/v1/rover/test/photo")
    assert r.status_code == 200 and r.content == jpeg and r.headers["content-type"] == "image/jpeg"


def test_snapshot_passes_on_the_motor_pins_the_firmware_reports():
    t = RoverTest()
    t.on_rover_status({**ONLINE, "fw": "rover-mc-2.1.0", "pins": "L:32,33,25;L:13,26,27;R:23,22,21;R:17,19,18", "pinsSaved": False})
    s = t.snapshot()["rover"]
    assert s["pins"] == "L:32,33,25;L:13,26,27;R:23,22,21;R:17,19,18" and s["pinsSaved"] is False
