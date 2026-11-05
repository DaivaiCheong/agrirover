"""Per-cell vision. Classical colour indices, no training data needed — they run
on the Pi in milliseconds and every number can be explained to a farmer.

    leaves     Excess-Green index  ExG = 2g - r - b  on chromatic coordinates
    yellowing  bright, saturated yellow pixels (chlorosis screen)
    dryness    brightness of the visible soil, between calibrated wet and dry
               references (dry soil is lighter than wet soil)

A yellowing tree is only *flagged*. If the MobileNetV2 disease model is
installed it is run on flagged cells; its answer is advisory and never
triggers a pump, valve or treatment.

Calibration: the defaults match the simulator. On a real bed, photograph a
patch of saturated soil and a patch of dry soil under the rover's own light
and set soil_v_wet / soil_v_dry from those (see docs/architecture/rover.md).
"""
from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np


@dataclass(frozen=True)
class Calibration:
    soil_v_wet: float = 0.353      # brightness (max channel, 0..1) of saturated soil
    soil_v_dry: float = 0.686      # brightness of dry soil
    min_canopy: float = 0.03       # below this the cell counts as bare
    water_at_dryness: float = 0.60
    flag_at_chlorosis: float = 0.08
    max_water_ml: int = 250


@dataclass(frozen=True)
class Observation:
    canopy: float                  # fraction of frame that is leaf
    plant: bool
    dryness: float | None          # 0 wet .. 1 dry; None if no soil is visible
    needs_water: bool
    chlorosis: float               # fraction of leaf area that is yellowing
    flagged: bool                  # yellowing above threshold: check for disease
    suggested_ml: int = 0
    disease: str | None = None
    disease_confidence: float | None = None


DEFAULT_CALIBRATION = Calibration()


def analyze(img: np.ndarray, cal: Calibration = DEFAULT_CALIBRATION) -> Observation:
    if img.ndim != 3 or img.shape[2] < 3:
        raise ValueError("expected an H x W x 3 RGB image")
    f = img[..., :3].astype(np.float32) / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    total = r + g + b + 1e-6
    exg = (2 * g - r - b) / total

    green = (exg > 0.10) & (g > r)
    # Strongly saturated yellow only: dry soil is tan, and must not read as a sick leaf.
    yellow = (r > 0.55) & (g > 0.50) & (b < 0.45 * g) & ~green
    leaf = green | yellow
    soil = ~leaf

    canopy = float(leaf.mean())
    leaf_px = int(leaf.sum())
    chlorosis = float(yellow.sum() / leaf_px) if leaf_px else 0.0

    dryness = None
    if soil.mean() > 0.02:
        v = f.max(axis=2)[soil].mean()
        span = max(cal.soil_v_dry - cal.soil_v_wet, 1e-6)
        dryness = float(np.clip((v - cal.soil_v_wet) / span, 0.0, 1.0))

    plant = canopy >= cal.min_canopy
    needs_water = plant and dryness is not None and dryness >= cal.water_at_dryness
    flagged = plant and chlorosis >= cal.flag_at_chlorosis
    ml = round(cal.max_water_ml * dryness) if needs_water else 0
    return Observation(round(canopy, 4), plant, None if dryness is None else round(dryness, 3),
                       needs_water, round(chlorosis, 4), flagged, ml)


def with_disease(obs: Observation, name: str, confidence: float) -> Observation:
    return replace(obs, disease=name, disease_confidence=round(float(confidence), 3))


class TFLiteDiseaseClassifier:
    """Adapter for the MobileNetV2 tomato-leaf model (mnv2-tomato-v1).

    The model file is not in this repository. Labels: one class name per line.
    Only results at or above `threshold` are reported (FR-F03); a result is
    always advisory (FR-F04).
    """

    def __init__(self, model_path: str, labels_path: str, threshold: float = 0.90):
        try:
            from tflite_runtime.interpreter import Interpreter
        except ImportError:                    # full TensorFlow on a dev machine
            from tensorflow.lite import Interpreter  # type: ignore[no-redef]
        self._it = Interpreter(model_path=model_path)
        self._it.allocate_tensors()
        self._in = self._it.get_input_details()[0]
        self._out = self._it.get_output_details()[0]
        with open(labels_path, encoding="utf-8") as fh:
            self.labels = [line.strip() for line in fh if line.strip()]
        self.threshold = threshold

    def classify(self, img: np.ndarray) -> tuple[str, float] | None:
        _, h, w, _ = self._in["shape"]
        ys = (np.arange(h) * img.shape[0] / h).astype(int)
        xs = (np.arange(w) * img.shape[1] / w).astype(int)
        x = img[ys][:, xs, :3]
        if self._in["dtype"] == np.uint8:
            x = x.astype(np.uint8)
        else:
            x = x.astype(np.float32) / 127.5 - 1.0     # MobileNetV2 preprocessing
        self._it.set_tensor(self._in["index"], x[None, ...])
        self._it.invoke()
        scores = self._it.get_tensor(self._out["index"])[0].astype(np.float32)
        scale, zero_point = self._out.get("quantization", (0.0, 0))
        if scale:                                      # quantised model: back to probabilities
            scores = (scores - zero_point) * scale
        i = int(np.argmax(scores))
        conf = float(scores[i])
        return (self.labels[i], conf) if conf >= self.threshold else None
