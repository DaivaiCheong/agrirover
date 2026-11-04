"""The readings a field node can send, and what a believable value looks like.

A 7-in-1 RS485 soil probe reports moisture, temperature, EC, pH and N, P, K. An ambient sensor reports
air temperature and humidity. Cheap probes fail loudly: a broken RS485 link reads 0 or 65535 (scaled:
655.35 pH, 6553.5 C), a DS18B20 that has not converted reads 85 C, and EC often comes in microsiemens.
So every reading goes through clean() before it is stored: the unit is converted to the one unit we
keep, and an impossible value is refused instead of being stored where it would poison a chart or
raise an alert.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.models.entities import Metric, Quality


@dataclass(frozen=True)
class MetricSpec:
    metric: Metric
    unit: str                       # the unit we store
    lo: float                       # smallest believable reading, in `unit`
    hi: float                       # largest believable reading
    label: str                      # what a farmer reads
    short: str                      # for a narrow cell
    decimals: int                   # how many decimals are worth showing
    units: tuple[tuple[str, float], ...]   # accepted spellings (lower case) -> factor into `unit`
    soil_probe: bool = False        # read by the soil probe, so it belongs to one probe code


_PCT = (("pct", 1.0), ("%", 1.0), ("percent", 1.0))
_PH = (("ph", 1.0),)
_C = (("c", 1.0), ("°c", 1.0), ("degc", 1.0), ("celsius", 1.0))
_MGKG = (("mg/kg", 1.0), ("ppm", 1.0))

SPECS: dict[Metric, MetricSpec] = {s.metric: s for s in (
    # --- the soil probe
    MetricSpec(Metric.soil_moisture, "pct", 0, 100, "Soil moisture", "Moisture", 1, _PCT, soil_probe=True),
    MetricSpec(Metric.soil_ph, "pH", 3, 10, "Soil pH", "pH", 2, _PH, soil_probe=True),
    # EC is stored in mS/cm. Probes usually count in uS/cm; dS/m is the same number as mS/cm.
    MetricSpec(Metric.soil_ec, "mS/cm", 0, 20, "Soil EC", "EC", 2,
               (("ms/cm", 1.0), ("ds/m", 1.0), ("us/cm", 0.001), ("µs/cm", 0.001), ("μs/cm", 0.001)),
               soil_probe=True),
    MetricSpec(Metric.soil_temperature, "C", -10, 60, "Soil temperature", "Soil °C", 1, _C, soil_probe=True),
    MetricSpec(Metric.nitrogen, "mg/kg", 0, 2000, "Nitrogen", "N", 0, _MGKG, soil_probe=True),
    MetricSpec(Metric.phosphorus, "mg/kg", 0, 2000, "Phosphorus", "P", 0, _MGKG, soil_probe=True),
    MetricSpec(Metric.potassium, "mg/kg", 0, 2000, "Potassium", "K", 0, _MGKG, soil_probe=True),
    # --- the air sensor
    MetricSpec(Metric.air_temperature, "C", -10, 60, "Air temperature", "Air °C", 1, _C),
    MetricSpec(Metric.air_humidity, "pct", 0, 100, "Air humidity", "RH", 1, _PCT + (("rh", 1.0), ("%rh", 1.0))),
    # --- the rest of the field node
    MetricSpec(Metric.water_ph, "pH", 0, 14, "Water pH", "Water pH", 2, _PH),
    MetricSpec(Metric.rain, "bool", 0, 1, "Rain", "Rain", 0, (("bool", 1.0),)),
    MetricSpec(Metric.supply_voltage, "V", 0, 30, "Supply voltage", "Supply", 2,
               (("v", 1.0), ("volt", 1.0), ("volts", 1.0), ("mv", 0.001))),
)}

SOIL_PROBE_METRICS = frozenset(m for m, s in SPECS.items() if s.soil_probe)


class Refused(ValueError):
    """A reading that must not be stored. The message says why, for the log."""


@dataclass(frozen=True)
class Clean:
    metric: Metric
    value: float
    unit: str
    quality: Quality
    sensor: str | None              # the probe code the node named, if it named one


def quality_of(raw: object) -> Quality:
    try:
        return Quality(raw)
    except ValueError:
        return Quality.suspect


def clean(item: dict) -> Clean:
    """One {metric, value, unit?, quality?, sensor?} entry, ready to store; raises Refused otherwise."""
    name = item.get("metric")
    try:
        metric = Metric(name)
    except ValueError:
        raise Refused(f"unknown metric {name!r}") from None
    spec = SPECS[metric]

    try:
        value = float(item["value"])
    except (KeyError, TypeError, ValueError):
        raise Refused(f"{name}: the value is not a number") from None
    if not math.isfinite(value):
        raise Refused(f"{name}: the value is not finite")

    unit = str(item.get("unit") or "").strip()
    if unit:                                          # no unit at all means "already in ours"
        factor = dict(spec.units).get(unit.lower())
        if factor is None:
            raise Refused(f"{name}: unit {unit!r} is not understood (we store {spec.unit})")
        value *= factor
    value = round(value, 3)                           # the column keeps 3 decimals; also removes 2450 * 0.001 noise
    if not spec.lo <= value <= spec.hi:
        raise Refused(f"{name}: {value:g} {spec.unit} is outside {spec.lo:g} to {spec.hi:g}")

    sensor = item.get("sensor")
    return Clean(metric, value, spec.unit, quality_of(item.get("quality", "valid")),
                 str(sensor) if sensor is not None else None)
