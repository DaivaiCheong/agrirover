"""Disease photo check: the classifier contract.

Triage, not diagnosis. get_classifier() returns None until a model is installed,
and the endpoint then says so instead of inventing a result. The TFLite adapter
arrives together with the model file.
"""
from __future__ import annotations

from typing import Protocol


class Classifier(Protocol):
    def classify(self, data: bytes) -> tuple[str, float] | None:
        """(label, confidence 0-1), or None when the model is not confident enough."""


def get_classifier() -> Classifier | None:
    return None
