"""Cameras. Every camera returns an RGB uint8 image of the cell under the rover.

NoCamera              a grey frame, for driving a round before the camera is mounted.

SimField / SimCamera  a synthetic bed with known ground truth, used for tests,
                      demos, and to check the vision against the truth.
FolderCamera          pictures from a folder, one per stop, to rehearse a round with real leaf photos.
PiCamera              Raspberry Pi camera module (picamera2).
OpenCVCamera          any USB webcam.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from rover.planner import Cell

# Reference colours for the simulation. vision.Calibration defaults match these;
# on a real bed, calibrate against your own soil (see docs/architecture/rover.md).
SOIL_WET = np.array([90, 65, 45], np.float32)
SOIL_DRY = np.array([175, 145, 105], np.float32)
LEAF = np.array([55, 135, 50], np.float32)
YELLOWING = np.array([205, 185, 60], np.float32)

DRY_BELOW = 0.40     # ground truth: a planted cell below this moisture needs water


@dataclass(frozen=True)
class CellTruth:
    plant: bool
    canopy: float      # fraction of the frame covered by leaves
    moisture: float    # 0 = dry, 1 = saturated
    chlorosis: float   # fraction of leaf area that is yellowing (0 = healthy)

    @property
    def needs_water(self) -> bool:
        return self.plant and self.moisture < DRY_BELOW


# What the soil and air read when the server does not say. Moisture is on the probe's 0-100 scale.
BASE_READINGS = {"soil_moisture": 62.0, "soil_ph": 6.3, "soil_ec": 1.6, "soil_temperature": 25.0, "nitrogen": 110.0,
                 "phosphorus": 80.0, "potassium": 190.0, "air_temperature": 26.5, "air_humidity": 68.0}
DECIMALS = {"soil_moisture": 1, "soil_ph": 2, "soil_ec": 2, "soil_temperature": 1, "nitrogen": 0, "phosphorus": 0,
            "potassium": 0, "air_temperature": 1, "air_humidity": 1}


class SimField:
    """A synthetic orchard block. Moisture falls along each row, as it does on a drip
    line losing pressure toward the far end, plus local variation."""

    def __init__(self, rows: int, cols: int, seed: int = 0,
                 plant_rate: float = 0.95, sick_rate: float = 0.1,
                 base: dict | None = None, moisture_spread: float = 12.0, planted: set[tuple[int, int]] | None = None):
        """`planted`: the spots that hold a plant (a plant map); the rest are bare. None: about plant_rate of them."""
        rng = np.random.default_rng(seed)
        self.rows, self.cols, self.seed = rows, cols, seed
        self.base = {**BASE_READINGS, **(base or {})}
        self.moisture_spread = moisture_spread
        self.cells: dict[tuple[int, int], CellTruth] = {}
        for r in range(rows):
            for c in range(cols):
                drawn = bool(rng.random() < plant_rate)     # always drawn, so the same seed gives the same field
                plant = drawn if planted is None else (r, c) in planted
                gradient = 0.75 - 0.55 * (c / max(cols - 1, 1))
                moisture = float(np.clip(gradient + rng.normal(0, 0.12), 0.0, 1.0))
                canopy = float(rng.uniform(0.20, 0.45)) if plant else 0.0
                sick = plant and rng.random() < sick_rate
                chlorosis = float(rng.uniform(0.15, 0.30)) if sick else 0.0
                self.cells[(r, c)] = CellTruth(plant, canopy, moisture, chlorosis)

    def truth(self, cell: Cell) -> CellTruth:
        return self.cells[(cell.row, cell.col)]

    def readings(self, cell: Cell) -> dict:
        """What the probe and air sensor read at this tree. The same tree always reads the same in one round."""
        rng = np.random.default_rng([self.seed, cell.row, cell.col, 2])
        out = {}
        for metric, value in self.base.items():
            out[metric] = round(float(value + rng.normal(0, 0.03 * max(1.0, abs(value)))), DECIMALS.get(metric, 2))
        along = cell.col / max(self.cols - 1, 1) - 0.5
        moisture = self.base["soil_moisture"] - along * self.moisture_spread + rng.normal(0, self.moisture_spread * 0.25)
        out["soil_moisture"] = round(float(np.clip(moisture, 0, 100)), 1)
        return out


class SimCamera:
    def __init__(self, field: SimField, size: int = 96,
                 lighting_jitter: float = 0.03, noise: float = 6.0):
        self.field, self.size = field, size
        self.lighting_jitter, self.noise = lighting_jitter, noise

    def capture(self, cell: Cell) -> np.ndarray:
        t = self.field.truth(cell)
        rng = np.random.default_rng([self.field.seed, cell.row, cell.col, 1])
        h = w = self.size
        img = np.empty((h, w, 3), np.float32)
        img[:] = SOIL_WET + (SOIL_DRY - SOIL_WET) * (1.0 - t.moisture)
        img *= rng.uniform(1 - self.lighting_jitter, 1 + self.lighting_jitter)

        if t.plant:
            yy, xx = np.mgrid[0:h, 0:w]
            radius = math.sqrt(t.canopy * h * w / math.pi)
            cy, cx = h / 2 + rng.uniform(-6, 6), w / 2 + rng.uniform(-6, 6)
            leaf = (yy - cy) ** 2 + (xx - cx) ** 2 <= radius ** 2
            img[leaf] = LEAF
            if t.chlorosis > 0:
                ys, xs = np.nonzero(leaf)
                target = t.chlorosis * len(ys)
                spots = np.zeros_like(leaf)
                for _ in range(500):
                    if spots.sum() >= target:
                        break
                    i = rng.integers(len(ys))
                    r = rng.uniform(2, 4)
                    spots |= leaf & ((yy - ys[i]) ** 2 + (xx - xs[i]) ** 2 <= r * r)
                img[spots] = YELLOWING

        img += rng.normal(0, self.noise, img.shape)
        return np.clip(img, 0, 255).astype(np.uint8)


class NoCamera:
    """No camera fitted: a plain grey frame, so a round can be driven before the camera is mounted.
    The vision then sees no plant at any stop, and the soil probe is not lowered."""

    def capture(self, cell: Cell) -> np.ndarray:
        return np.full((48, 64, 3), 128, np.uint8)


class FolderCamera:
    """The pictures in a folder (.jpg, .jpeg, .png, in name order), one per capture, starting again after the last.
    Used with the simulated rover to rehearse a round with real leaf photos. Needs Pillow."""

    SUFFIXES = (".jpg", ".jpeg", ".png")

    def __init__(self, folder: str | Path, max_side: int = 1280):
        self.folder = Path(folder)
        if not self.folder.is_dir():
            raise ValueError(f"{self.folder} is not a folder")
        self.files = sorted(f for f in self.folder.iterdir() if f.is_file() and f.suffix.lower() in self.SUFFIXES)
        if not self.files:
            raise ValueError(f"no .jpg, .jpeg or .png pictures in {self.folder}")
        self.max_side = max_side        # about what a real camera gives; phone photos are much larger
        self.captures = 0

    def capture(self, cell: Cell) -> np.ndarray:
        from PIL import Image
        path = self.files[self.captures % len(self.files)]
        self.captures += 1
        with Image.open(path) as im:
            frame = im.convert("RGB")
        frame.thumbnail((self.max_side, self.max_side))     # keeps the shape; never enlarges
        return np.asarray(frame, dtype=np.uint8).copy()


class CameraError(RuntimeError):
    """The camera gave no photo. Ends the round like any other camera fault."""


class HttpCamera:
    """The rover's ESP32-CAM (edge/rover-camera): GET <url> returns a fresh JPEG. The rover program runs on the farm
    server and pulls a photo at each plant, so the camera needs no upload path and the photo check is unchanged.
    One retry: a Wi-Fi hiccup should not end a round. Needs Pillow."""

    def __init__(self, url: str, timeout_s: float = 8.0, tries: int = 2, flash: bool = False, max_side: int = 1600,
                 opener=None):
        if not url.startswith(("http://", "https://")):
            raise ValueError(f"camera URL must start with http://, got {url!r}")
        self.url = url + (("&" if "?" in url else "?") + "flash=1" if flash else "")
        self.timeout_s, self.tries, self.max_side = timeout_s, max(1, tries), max_side
        self._open = opener                    # tests pass a fake; None = urllib
        self.captures = 0
        self.last_jpeg: bytes | None = None    # what the camera sent, before decoding

    def fetch(self) -> bytes:
        import urllib.request
        last: Exception | None = None
        for _ in range(self.tries):
            try:
                if self._open:
                    data = self._open(self.url, self.timeout_s)
                else:
                    with urllib.request.urlopen(self.url, timeout=self.timeout_s) as r:   # noqa: S310 — our own LAN camera
                        data = r.read()
                if data[:3] == b"\xff\xd8\xff":
                    return data
                last = CameraError(f"camera at {self.url} sent something that is not a JPEG")
            except OSError as exc:            # URLError, timeouts, refused
                last = exc
        raise CameraError(f"no photo from the camera at {self.url}: {last}")

    def capture(self, cell: Cell) -> np.ndarray:
        import io
        from PIL import Image
        data = self.fetch()
        self.last_jpeg = data
        self.captures += 1
        with Image.open(io.BytesIO(data)) as im:
            frame = im.convert("RGB")
        frame.thumbnail((self.max_side, self.max_side))
        return np.asarray(frame, dtype=np.uint8).copy()


class PiCamera:
    """Raspberry Pi camera module (picamera2 ships with Raspberry Pi OS)."""

    def __init__(self, size: tuple[int, int] = (640, 480)):
        from picamera2 import Picamera2
        self._cam = Picamera2()
        self._cam.configure(self._cam.create_still_configuration(
            main={"size": size, "format": "RGB888"}))
        self._cam.start()

    def capture(self, cell: Cell) -> np.ndarray:
        # picamera2's "RGB888" is laid out B, G, R in memory — flip to RGB.
        return self._cam.capture_array()[:, :, ::-1].copy()


class OpenCVCamera:
    """USB webcam (pip install opencv-python-headless)."""

    def __init__(self, index: int = 0):
        import cv2
        self._cap = cv2.VideoCapture(index)
        if not self._cap.isOpened():
            raise RuntimeError(f"camera {index} not available")

    def capture(self, cell: Cell) -> np.ndarray:
        for _ in range(3):
            self._cap.grab()                   # drop frames buffered while moving
        ok, frame = self._cap.read()
        if not ok:
            raise RuntimeError("camera read failed")
        return frame[:, :, ::-1].copy()        # BGR -> RGB
