"""A symptom the camera sees, set against what the sensors read: do the soil and the air explain it?

Triage, not diagnosis. A reading that fits makes a physical cause plausible; it does not prove it. A
reading that does not fit does not rule the symptom out, it only means the sensors cannot confirm it.

The rules and the explanations in "spec" wording are the farm's own table (2026-11-04). Where a rule
needs a limit the table leaves open ("high EC", "moisture deficit"), the limit is the crop stage's own
target (agronomy.py). Two choices go beyond the table, both marked "practice" where they show:
  * leaf curling counts soil above 30 C (the Root heat stress line) as heat, not only soil above 32 C,
    so the photo check and the Root heat stress alert never disagree;
  * when only the secondary cause is met (a dry root zone behind leaf curl, salt behind chlorosis) the
    explanation says that, instead of reusing the heat or alkaline sentence.
"""
from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Metric
from app.services.agronomy import (FRESH_FOR, GENERIC_EC, GENERIC_MOISTURE, SOIL_TEMP_CRITICAL, Reading, StageInfo)
from app.services.conditions import load_snapshots
from app.services.metrics import SPECS
from app.services.rule_engine import utcnow

MOISTURE_BER = 50.0          # the photo check is more sensitive than the alert (45): the damage is already visible
PH_BER = 5.8
RH_BLIGHT = 80.0
AIR_TEMP_CURL = 32.0
PH_ALKALINE = 7.2


@dataclass(frozen=True)
class Check:
    metric: Metric
    op: Literal["<", ">"]
    limit: float
    cause: str                  # which explanation this evidence belongs to

    def met(self, value: float) -> bool:
        return value < self.limit if self.op == "<" else value > self.limit


SYMPTOMS: dict[str, str] = {
    "blossom_end_rot": "Blossom end rot",
    "early_blight": "Early blight",
    "leaf_curl": "Leaf curling",
    "interveinal_chlorosis": "Interveinal chlorosis",
}

# What each symptom's label may look like coming out of a model. Tokens must match whole, so "ber" would not match "number".
_ALIASES = {
    "blossom_end_rot": ("blossom_end_rot",),
    "early_blight": ("early_blight", "alternaria_solani"),
    "leaf_curl": ("leaf_curl", "leaf_curling", "curling_leaves", "curled_leaves"),
    "interveinal_chlorosis": ("interveinal_chlorosis", "interveinal"),
}
# Leaf curl from a virus is not the physiological kind the rule is about: shade cloth does not cure it.
_NOT_LEAF_CURL = ("virus", "tylcv", "yellow_leaf_curl")

CAVEATS = {
    "leaf_curl": "Leaf curl with yellowing and stunted growth can also be a whitefly-borne virus. "
                 "The sensors cannot tell the two apart.",
}


def normalise(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def match_symptom(label: str | None) -> str | None:
    """The symptom id for a classifier label ("Tomato___Early_blight" -> "early_blight"), or None."""
    if not label:
        return None
    padded = f"_{normalise(label)}_"
    for symptom, aliases in _ALIASES.items():
        if any(f"_{a}_" in padded for a in aliases):
            if symptom == "leaf_curl" and any(bad in padded for bad in _NOT_LEAF_CURL):
                return None
            return symptom
    return None


def _checks(symptom: str, stage: StageInfo | None) -> list[Check]:
    if symptom == "blossom_end_rot":
        return [Check(Metric.soil_moisture, "<", MOISTURE_BER, "root_zone"), Check(Metric.soil_ph, "<", PH_BER, "root_zone")]
    if symptom == "early_blight":
        return [Check(Metric.air_humidity, ">", RH_BLIGHT, "humidity")]
    if symptom == "leaf_curl":
        deficit = stage.moisture[0] if stage else GENERIC_MOISTURE.lo
        return [Check(Metric.air_temperature, ">", AIR_TEMP_CURL, "heat"),
                Check(Metric.soil_temperature, ">", SOIL_TEMP_CRITICAL, "heat"),
                Check(Metric.soil_moisture, "<", deficit, "water")]
    if symptom == "interveinal_chlorosis":
        salty = stage.ec[1] if stage else GENERIC_EC.hi
        return [Check(Metric.soil_ph, ">", PH_ALKALINE, "alkaline"), Check(Metric.soil_ec, ">", salty, "salt")]
    raise KeyError(symptom)


# (text, basis): "spec" is the farm table's own sentence, "practice" is ours.
EXPLAIN: dict[str, dict[str, tuple[str, str]]] = {
    "blossom_end_rot": {
        "root_zone": ("Calcium transport locked by dry/acidic root zone. Increase drip volume and spray foliar calcium.", "spec")},
    "early_blight": {
        "humidity": ("Fungal sporulation favored by stagnant high humidity. Prune lower foliage and ventilate.", "spec")},
    "leaf_curl": {
        "heat": ("Physiological defense to reduce transpiration. Deploy shade cloth.", "spec"),
        "water": ("Physiological defense to reduce water loss in a dry root zone. Check the irrigation.", "practice")},
    "interveinal_chlorosis": {
        "alkaline": ("Micronutrient lockout (Iron/Magnesium) due to alkaline soil. Acidify irrigation water.", "spec"),
        "salt": ("Micronutrient lockout (Iron/Magnesium) under a high salt load. Flush with clean water before feeding again.",
                 "practice")},
}


# When a second cause is also met, its sentence continues the first instead of repeating it.
FOLLOW_ON: dict[tuple[str, str], tuple[str, str]] = {
    ("leaf_curl", "water"): ("The root zone is dry as well. Check the irrigation.", "practice"),
    ("interveinal_chlorosis", "salt"): ("A high salt load adds to it. Flush with clean water before feeding again.", "practice"),
}


def correlate(symptom: str, readings: Mapping[str, Reading], *, stage: StageInfo | None, now: datetime) -> dict:
    """Set one symptom against a bed's newest readings. Old readings (older than agronomy.FRESH_FOR) are
    shown but never counted: a dry reading from yesterday does not explain a leaf today."""
    if symptom not in SYMPTOMS:
        raise KeyError(symptom)
    evidence, met_causes, fresh_seen = [], [], 0
    for t in _checks(symptom, stage):
        spec, r = SPECS[t.metric], readings.get(t.metric.value)
        age = None if r is None else max(0, round((now - r.at).total_seconds()))
        fresh = r is not None and now - r.at <= FRESH_FOR
        met = t.met(r.value) if fresh else None
        fresh_seen += fresh
        if met and t.cause not in met_causes:
            met_causes.append(t.cause)
        evidence.append({"metric": t.metric.value, "label": spec.label, "unit": spec.unit, "decimals": spec.decimals,
                         "op": t.op, "limit": t.limit, "value": r.value if r else None, "ageSeconds": age,
                         "stale": r is not None and not fresh, "met": met})

    if met_causes:
        verdict = "supported"
        parts = [FOLLOW_ON.get((symptom, c), EXPLAIN[symptom][c]) if i else EXPLAIN[symptom][c]
                 for i, c in enumerate(met_causes)]
        explanation = " ".join(text for text, _ in parts)
        basis = "spec" if all(b == "spec" for _, b in parts) else "practice"
    else:
        verdict = "not_supported" if fresh_seen else "no_data"
        explanation, basis = None, None
    return {"symptom": symptom, "title": SYMPTOMS[symptom], "verdict": verdict, "evidence": evidence,
            "explanation": explanation, "basis": basis, "caveat": CAVEATS.get(symptom),
            "stage": None if stage is None else {"key": stage.key, "title": stage.title, "day": stage.day}}


async def diagnose(session: AsyncSession, farm_name: str, zone_name: str, symptom: str,
                   now: datetime | None = None) -> dict:
    """The symptom against one bed's live readings. Unknown bed -> NotFound."""
    now = now or utcnow()
    snap = (await load_snapshots(session, farm_name, now, zone_name))[0]
    out = correlate(symptom, snap.readings, stage=snap.assess(now).stage, now=now)
    return {**out, "zone": snap.zone.name, "label": snap.zone.label}
