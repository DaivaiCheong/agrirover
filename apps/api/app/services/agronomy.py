"""Stage-aware crop conditions: are this bed's soil and air where tomato wants them today?

A pure function: readings and the crop day in, a status per reading and a list of alerts out. No
database, no clock, no valve. This module ADVISES. It never decides to water: that stays with
rule_engine.py and the thresholds in each bed's irrigation rule (docs/UX-DECISIONS.md: "the irrigation
thresholds belong to the rule engine, which this app does not override").

Where the numbers come from: the farm's own agronomy table, written down on 2026-11-04 (the "spec"
basis in docs/TOMATO-RESEARCH.md). They are the owner's targets, not figures checked against a study
here. The stage windows (days 1-25, 26-45, 46-70, 71-110) are NOT the FAO-56 water stages that
crop_guide.py uses for the water plan (days 1-30, 31-70, 71-110, 111-135); the two answer different
questions and are named differently on screen.

How a reading is rated:
  inside its target range            -> normal
  outside it                         -> warning, with a direction (low / high)
  past a hard limit from the spec    -> critical (soil temperature above 30 C, air above 32 C, humidity
                                        above 85 %, EC above 4.0, pH below 5.8, moisture below 45 %)
  named in an alert                  -> at least the alert's severity
An old reading (older than FRESH_FOR) is shown but never rated and never raises an alert: yesterday's
34 C must not sterilise today's pollen.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from app.models.entities import Metric
from app.services.metrics import SPECS

Status = Literal["normal", "warning", "critical", "stale", "no_data", "unrated"]
Direction = Literal["low", "high"]

BASIS = "spec"
SOURCE = ("Your farm's agronomy table (2026-11-04). The targets are yours; they were not checked against a "
          "study here.")

# A reading older than this is shown, but is not rated and raises no alert.
FRESH_FOR = timedelta(minutes=30)

# Daytime for pollen: 06:00 up to (not including) 18:00 farm time. Near the equator the sun is up about 12 hours.
DAY_FROM_H, DAY_TO_H = 6, 18

# Hard limits from the spec, named once so the bands and the alerts cannot drift apart.
MOISTURE_LOCKUP = 45.0          # below: calcium lockup, blossom end rot
PH_LOCKUP = 5.8                 # below: calcium lockup
EC_BURN = 4.0                   # above: salinity, fertilizer burn
SOIL_TEMP_CRITICAL = 30.0       # above: root heat stress
AIR_TEMP_CRITICAL = 32.0        # above by day: pollen dies; also the air temperature's own critical line
NIGHT_TEMP_CRITICAL = 26.0      # above at night: pollen dies
RH_CRITICAL = 85.0              # above: high fungal risk
FUNGAL_AIR_TEMP = 22.0          # the fungal window needs warmth as well as humidity
FLOWERING_MOISTURE_FLOOR = 55.0
POLLEN_FROM_DAY = 46            # flowering starts here, and the alert stays on for the rest of the crop


@dataclass(frozen=True)
class Range:
    lo: float
    hi: float


@dataclass(frozen=True)
class Stage:
    n: int
    key: str
    title: str
    first_day: int
    last_day: int
    moisture: Range
    ec: Range
    focus: str


TOMATO_STAGES = (
    Stage(1, "seedling", "Seedling and transplant", 1, 25, Range(65, 75), Range(1.2, 1.8),
          "Root establishment. Moderate N, high P."),
    Stage(2, "vegetative", "Vegetative growth", 26, 45, Range(60, 75), Range(1.8, 2.4),
          "Canopy growth. High N."),
    Stage(3, "flowering", "Flowering and fruit set", 46, 70, Range(65, 80), Range(2.2, 3.0),
          "Heat above 32 °C by day or 26 °C at night sterilizes pollen. Never let moisture fall below 55 %."),
    Stage(4, "fruiting", "Fruit bulking and ripening", 71, 110, Range(50, 65), Range(2.5, 3.5),
          "Lower moisture prevents fruit cracking and raises Brix. High K."),
)

# Used while no crop is in the ground (the bed is idle or not planted yet).
GENERIC_MOISTURE = Range(50, 80)
GENERIC_EC = Range(1.5, 3.5)


@dataclass(frozen=True)
class Band:
    """A target range, and the hard limits (if any) beyond which the reading is critical."""
    lo: float
    hi: float
    crit_lo: float | None = None
    crit_hi: float | None = None


def _bands(stage: StageInfo | None) -> dict[Metric, Band]:
    """The target range of every rated reading today. Moisture and EC follow the stage; the rest do not."""
    m_lo, m_hi = stage.moisture if stage else (GENERIC_MOISTURE.lo, GENERIC_MOISTURE.hi)
    e_lo, e_hi = stage.ec if stage else (GENERIC_EC.lo, GENERIC_EC.hi)
    return {
        Metric.soil_moisture: Band(m_lo, m_hi, crit_lo=MOISTURE_LOCKUP),
        Metric.soil_ph: Band(6.0, 6.8, crit_lo=PH_LOCKUP),
        Metric.soil_ec: Band(e_lo, e_hi, crit_hi=EC_BURN),
        Metric.soil_temperature: Band(18, 26, crit_hi=SOIL_TEMP_CRITICAL),
        Metric.nitrogen: Band(100, 150),
        Metric.phosphorus: Band(60, 100),
        Metric.potassium: Band(150, 250),
        Metric.air_temperature: Band(21, 29, crit_hi=AIR_TEMP_CRITICAL),
        Metric.air_humidity: Band(60, 75, crit_hi=RH_CRITICAL),
    }


RIBBON_ORDER = (Metric.soil_moisture, Metric.soil_ph, Metric.soil_ec, Metric.soil_temperature, Metric.nitrogen,
                Metric.phosphorus, Metric.potassium, Metric.air_temperature, Metric.air_humidity)

# crop slug -> its stage table. Only tomato has one; a bed of anything else is shown, not rated.
AGRONOMY: dict[str, tuple[Stage, ...]] = {"tomato": TOMATO_STAGES}

_RANK = {"critical": 3, "warning": 2, "normal": 1, "stale": 0, "no_data": 0, "unrated": 0}


@dataclass(frozen=True)
class Reading:
    value: float
    at: datetime


@dataclass(frozen=True)
class Param:
    metric: str
    label: str
    short: str
    unit: str
    decimals: int
    value: float | None
    at: datetime | None
    status: Status
    direction: Direction | None
    target: tuple[float, float] | None


@dataclass(frozen=True)
class Alert:
    id: str
    severity: Literal["critical"]
    title: str
    message: str
    hits: tuple[tuple[str, Direction], ...]       # the readings that crossed the line, and which way


@dataclass(frozen=True)
class StageInfo:
    n: int
    key: str
    title: str
    first_day: int
    last_day: int
    day: int
    extended: bool                    # past the last day in the table: the last stage goes on
    moisture: tuple[float, float]
    ec: tuple[float, float]
    focus: str


@dataclass(frozen=True)
class Assessment:
    rated: bool
    stage: StageInfo | None
    params: tuple[Param, ...]
    alerts: tuple[Alert, ...]
    status: Status

    def to_dict(self) -> dict:
        s = self.stage
        return {
            "rated": self.rated, "status": self.status, "basis": BASIS, "source": SOURCE,
            "stage": None if s is None else {
                "n": s.n, "key": s.key, "title": s.title, "firstDay": s.first_day, "lastDay": s.last_day,
                "day": s.day, "extended": s.extended, "moisture": list(s.moisture), "ec": list(s.ec),
                "focus": s.focus},
            "params": [{"metric": p.metric, "label": p.label, "short": p.short, "unit": p.unit,
                        "decimals": p.decimals, "value": p.value,
                        "recordedAt": p.at.isoformat() if p.at else None, "status": p.status,
                        "direction": p.direction, "target": list(p.target) if p.target else None}
                       for p in self.params],
            "alerts": [{"id": a.id, "severity": a.severity, "title": a.title, "message": a.message,
                        "metrics": [m for m, _ in a.hits]} for a in self.alerts],
        }


def stage_for_day(stages: tuple[Stage, ...], day: int | None) -> StageInfo | None:
    """The stage a crop is in on `day` (the planting day is day 1). None before planting or with no crop.
    Past the last day in the table the last stage carries on (tomatoes are picked well after day 110)."""
    if day is None or day < 1:
        return None
    stage = next((s for s in stages if s.first_day <= day <= s.last_day), stages[-1])
    return StageInfo(stage.n, stage.key, stage.title, stage.first_day, stage.last_day, day,
                     extended=day > stages[-1].last_day,
                     moisture=(stage.moisture.lo, stage.moisture.hi), ec=(stage.ec.lo, stage.ec.hi),
                     focus=stage.focus)


def rate(value: float, band: Band) -> tuple[Status, Direction | None]:
    """normal / warning / critical for one reading. The limits are strict, as in the spec: exactly 32.0 is not past 32."""
    if band.crit_hi is not None and value > band.crit_hi:
        return "critical", "high"
    if band.crit_lo is not None and value < band.crit_lo:
        return "critical", "low"
    if value < band.lo:
        return "warning", "low"
    if value > band.hi:
        return "warning", "high"
    return "normal", None


def is_daytime(at: datetime, farm_tz: str) -> bool:
    return DAY_FROM_H <= at.astimezone(ZoneInfo(farm_tz)).hour < DAY_TO_H


def _alerts(fresh: Mapping[str, Reading], stage: StageInfo, farm_tz: str) -> list[Alert]:
    """The alerts that are on right now. `fresh` holds only readings young enough to act on."""
    def get(m: Metric) -> Reading | None:
        return fresh.get(m.value)

    out: list[Alert] = []
    moisture, ph, ec = get(Metric.soil_moisture), get(Metric.soil_ph), get(Metric.soil_ec)
    soil_t, air_t, rh = get(Metric.soil_temperature), get(Metric.air_temperature), get(Metric.air_humidity)

    # Pollen sterility: from flowering on, heat by day or a warm night.
    if air_t is not None and stage.day >= POLLEN_FROM_DAY:
        by_day = is_daytime(air_t.at, farm_tz)
        limit = AIR_TEMP_CRITICAL if by_day else NIGHT_TEMP_CRITICAL
        if air_t.value > limit:
            out.append(Alert("pollen_sterility", "critical", "Pollen sterility",
                             f"Air {air_t.value:.1f} °C {'by day' if by_day else 'at night'}, above {limit:g} °C. "
                             "Pollen turns sterile and flowers drop.", (("air_temperature", "high"),)))

    # Calcium lockup / blossom end rot: dry or acidic root zone.
    causes, hits = [], []
    if moisture is not None and moisture.value < MOISTURE_LOCKUP:
        causes.append(f"Soil moisture {moisture.value:.1f} % is below {MOISTURE_LOCKUP:g} %")
        hits.append(("soil_moisture", "low"))
    if ph is not None and ph.value < PH_LOCKUP:
        causes.append(f"{'Soil pH' if not causes else 'soil pH'} {ph.value:.2f} is below {PH_LOCKUP:g}")
        hits.append(("soil_ph", "low"))
    if causes:
        out.append(Alert("calcium_lockup", "critical", "Calcium lockup, blossom end rot risk",
                         f"{' and '.join(causes)}. Calcium cannot reach the fruit.", tuple(hits)))

    # Fungal / blight window: humid and warm together. Humidity is the culprit; the warmth only lets it
    # happen, and 24 C is a normal air temperature, so only the humidity reading is lifted.
    if rh is not None and air_t is not None and rh.value > RH_CRITICAL and air_t.value > FUNGAL_AIR_TEMP:
        out.append(Alert("fungal_window", "critical", "Fungal and blight window",
                         f"Humidity {rh.value:.0f} % (above {RH_CRITICAL:g} %) with air {air_t.value:.1f} °C "
                         f"(above {FUNGAL_AIR_TEMP:g} °C).", (("air_humidity", "high"),)))

    # Salinity / fertilizer burn.
    if ec is not None and ec.value > EC_BURN:
        out.append(Alert("salinity", "critical", "Salinity and fertilizer burn",
                         f"Soil EC {ec.value:.2f} mS/cm is above {EC_BURN:g}. Salts are burning the roots.",
                         (("soil_ec", "high"),)))

    # Root heat stress.
    if soil_t is not None and soil_t.value > SOIL_TEMP_CRITICAL:
        out.append(Alert("root_heat", "critical", "Root heat stress",
                         f"Soil {soil_t.value:.1f} °C is above {SOIL_TEMP_CRITICAL:g} °C.", (("soil_temperature", "high"),)))

    # Stage 3: "never let moisture drop below 55 %".
    if (moisture is not None and stage.key == "flowering" and moisture.value < FLOWERING_MOISTURE_FLOOR):
        out.append(Alert("flowering_moisture_floor", "critical", "Flowering moisture floor",
                         f"Soil moisture {moisture.value:.1f} % is below the {FLOWERING_MOISTURE_FLOOR:g} % floor "
                         "for flowering.", (("soil_moisture", "low"),)))
    return out


def assess(readings: Mapping[str, Reading], *, crop: str | None, day: int | None, now: datetime,
           farm_tz: str = "Asia/Phnom_Penh") -> Assessment:
    """Rate a bed's newest readings.

    readings  {metric name: Reading} the newest reading of each metric (Metric.value as the key)
    crop      the crop slug of the open cycle, or None when nothing is planted
    day       the crop day (planting day = day 1), or None; before planting counts as None
    With nothing planted (crop None) the readings are rated against the general ranges, with no stage and no
    alerts. A crop with no stage table is not rated: its readings come back "unrated", with no alerts.
    """
    if crop is None:
        stages, stage = TOMATO_STAGES, None
    else:
        stages = AGRONOMY.get(crop)
        stage = stage_for_day(stages, day) if stages else None
    bands = _bands(stage) if stages else {}
    fresh = {k: r for k, r in readings.items() if now - r.at <= FRESH_FOR}

    params: dict[Metric, Param] = {}
    for metric in RIBBON_ORDER:
        spec, r, band = SPECS[metric], readings.get(metric.value), bands.get(metric)
        base = Param(metric=metric.value, label=spec.label, short=spec.short, unit=spec.unit,
                     decimals=spec.decimals, value=None, at=None, status="no_data", direction=None,
                     target=(band.lo, band.hi) if band else None)
        if r is None:
            params[metric] = base
        elif band is None:
            params[metric] = replace(base, value=r.value, at=r.at, status="unrated")
        elif metric.value not in fresh:
            params[metric] = replace(base, value=r.value, at=r.at, status="stale")
        else:
            status, direction = rate(r.value, band)
            params[metric] = replace(base, value=r.value, at=r.at, status=status, direction=direction)

    alerts = _alerts(fresh, stage, farm_tz) if stage is not None else []
    for a in alerts:                                    # an alert lifts the readings it names to its own severity
        for name, direction in a.hits:
            m = Metric(name)
            if _RANK[a.severity] > _RANK[params[m].status]:
                params[m] = replace(params[m], status=a.severity, direction=direction)

    statuses = [p.status for p in params.values()]
    overall = max(statuses, key=lambda s: _RANK[s])
    if _RANK[overall] == 0:                             # nothing was rated: say why
        overall = next((s for s in ("unrated", "stale") if s in statuses), "no_data")
    return Assessment(rated=stages is not None, stage=stage, params=tuple(params[m] for m in RIBBON_ORDER),
                      alerts=tuple(alerts), status=overall)
