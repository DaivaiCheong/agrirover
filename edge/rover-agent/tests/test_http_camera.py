"""HttpCamera: the rover's ESP32-CAM, pulled over HTTP. A real local server stands in for the camera."""
import io
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

from rover.camera import CameraError, HttpCamera  # noqa: E402
from rover.planner import Cell  # noqa: E402


def jpeg(w=64, h=48, colour=(40, 140, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), colour).save(buf, "JPEG")
    return buf.getvalue()


class FakeCam(BaseHTTPRequestHandler):
    replies: list = []
    paths: list = []

    def do_GET(self):  # noqa: N802
        FakeCam.paths.append(self.path)
        code, body = FakeCam.replies.pop(0) if FakeCam.replies else (200, jpeg())
        self.send_response(code)
        self.send_header("Content-Type", "image/jpeg")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@pytest.fixture
def cam_url():
    FakeCam.replies, FakeCam.paths = [], []
    srv = HTTPServer(("127.0.0.1", 0), FakeCam)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}/capture"
    srv.shutdown()


def test_capture_returns_rgb_frame_and_keeps_the_jpeg(cam_url):
    cam = HttpCamera(cam_url)
    img = cam.capture(Cell(0, 0))
    assert img.shape == (48, 64, 3) and img.dtype == np.uint8
    assert abs(int(img[..., 1].mean()) - 140) < 10          # the leaf green came through
    assert cam.last_jpeg[:3] == b"\xff\xd8\xff" and cam.captures == 1


def test_one_failed_request_is_retried(cam_url):
    FakeCam.replies = [(503, b"capture failed")]
    assert HttpCamera(cam_url).capture(Cell(0, 0)).shape == (48, 64, 3)
    assert len(FakeCam.paths) == 2


def test_no_photo_after_retries_raises_camera_error(cam_url):
    FakeCam.replies = [(503, b"x"), (200, b"not a jpeg")]
    with pytest.raises(CameraError, match="not a JPEG"):
        HttpCamera(cam_url).capture(Cell(0, 0))


def test_camera_not_on_the_network_raises_camera_error():
    with pytest.raises(CameraError, match="no photo"):
        HttpCamera("http://127.0.0.1:9/capture", timeout_s=0.5).fetch()


def test_flash_asks_for_the_led_and_big_photos_are_shrunk(cam_url):
    FakeCam.replies = [(200, jpeg(3200, 2400))]
    img = HttpCamera(cam_url, flash=True).capture(Cell(0, 0))
    assert FakeCam.paths[0] == "/capture?flash=1"
    assert max(img.shape[:2]) == 1600


def test_url_must_be_http():
    with pytest.raises(ValueError):
        HttpCamera("192.168.1.12/capture")
