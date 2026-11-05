"""Cameras. Every camera returns an RGB uint8 image of the cell under the rover.

SimField / SimCamera  a synthetic bed with known ground truth, used for tests,
                      demos, and to check the vision against the truth.
PiCamera              Raspberry Pi camera module (picamera2).
OpenCVCamera          any USB webcam.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

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
                 base: dict | None = None, moisture_spread: float = 12.0):
        rng = np.random.default_rng(seed)
        self.rows, self.cols, self.seed = rows, cols, seed
        self.base = {**BASE_READINGS, **(base or {})}
        self.moisture_spread = moisture_spread
        self.cells: dict[tuple[int, int], CellTruth] = {}
        for r in range(rows):
            for c in range(cols):
                plant = bool(rng.random() < plant_rate)
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
