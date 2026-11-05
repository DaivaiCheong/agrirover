"""Disease photo check: the classifier contract, and Gemma on a local Ollama behind it.

Triage, not diagnosis. get_classifier() returns None when no model is configured, and the endpoint then says so
instead of inventing a result. The photo goes to the Ollama server named in the settings and nowhere else; keep it on
the farm's own machine.

Gemma only answers healthy, problem or unsure, and says what it sees. Asked to name the disease on real guava photos
it was right 6 times in 30, and said anthracnose 22 times on a set with none (docs/GUAVA-RESEARCH.md), so its answer
never picks a symptom or triggers advice. The farmer compares the signs and chooses. A trained model with measured
accuracy can return a disease label and a real confidence behind the same contract.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import settings

TIMEOUT_S = 300.0                   # the first photo also loads the model into memory
HEALTHY, PROBLEM, UNSURE = "healthy", "problem", "unsure"
PROMPT = (
    "You are checking one close-up photo of a guava leaf or fruit for a farmer. Look only at what is visible.\n"
    f"Choose one label:\n- {HEALTHY}: evenly coloured and clean, with no spots, patches, holes or damage. Natural speckles on guava skin are fine.\n"
    f"- {PROBLEM}: any spots, patches, yellowing, mould, scabs, holes, insects, scorching or splits.\n"
    f"- {UNSURE}: not a guava leaf or fruit, or too blurred or dark to judge.\n"
    "Do not name a disease. In `seen`, describe the visible signs in one short sentence."
)
SCHEMA = {"type": "object", "required": ["seen", "label"],
          "properties": {"seen": {"type": "string"}, "label": {"type": "string", "enum": [HEALTHY, PROBLEM, UNSURE]}}}


class ModelUnavailable(Exception):
    """The configured model could not be reached or could not read the photo."""


@dataclass(frozen=True)
class Seen:
    label: str
    confidence: float | None = None    # a measured probability, or None when the model cannot give one
    seen: str | None = None            # what it says it saw, in its own words


class Classifier(Protocol):
    def classify(self, data: bytes) -> Seen | None:
        """What the photo shows, or None when the model is not sure. Raises ModelUnavailable when it cannot answer."""


class OllamaClassifier:
    def __init__(self, url: str, model: str, post=httpx.post):
        self.url, self.model, self._post = url.rstrip("/"), model, post

    def classify(self, data: bytes) -> Seen | None:
        body = {"model": self.model, "stream": False, "think": False, "format": SCHEMA, "options": {"temperature": 0},
                "messages": [{"role": "user", "content": PROMPT, "images": [base64.b64encode(data).decode("ascii")]}]}
        try:
            res = self._post(f"{self.url}/api/chat", json=body, timeout=TIMEOUT_S)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"cannot reach the disease model at {self.url}") from exc
        if res.status_code == 404:
            raise ModelUnavailable(f"disease model {self.model} is not installed: run `ollama pull {self.model}`")
        if res.status_code != 200:
            raise ModelUnavailable(f"disease model answered {res.status_code}")
        try:
            out = json.loads(res.json()["message"]["content"])
            label = out["label"]
        except (ValueError, KeyError, TypeError) as exc:
            raise ModelUnavailable("disease model gave an answer that could not be read") from exc
        return None if label == UNSURE else Seen(label, None, out.get("seen"))


def get_classifier() -> Classifier | None:
    return OllamaClassifier(settings.ollama_url, settings.ollama_model) if settings.ollama_model else None
