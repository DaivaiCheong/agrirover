"""Simulated rover data, so the screens have something true to the rules until a real rover runs.

Everything here ends up marked simulated. `readings_for` gives a bed's readings on a cycle day, with a few scripted
events so every rule can be seen; the live rover simulation is sent the same numbers, so a round run today agrees with
the two weeks of rounds before it.
"""
from __future__ import annotations

import math
import random
import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Farm, Planting, SurveyMission, Zone
from app.services import guava
from app.services.farm_data import grid_for
from app.services.rover_live import store_report
from app.services.rule_engine import utcnow

ROUNDS = 14
EVENTS = (
    (26, 32, {"air_humidity": 88.0}),                                  # humid spell during stress
    (58, 63, {"soil_ec": 0.7}),                                        # the flush outruns the feed
    (88, 92, {"soil_moisture": 52.0}),                                 # a dry spell at bloom
    (118, 124, {"air_temperature": 29.5, "air_humidity": 76.0}),       # warm and humid: fruit fly weather
    (150, 152, {"soil_ph": 7.4}),                                      # alkaline water
    (163, 164, {"soil_moisture": 33.0}),                               # the dry days before the storm
    (165, 167, {"soil_moisture": 82.0}),                               # heavy rain on dry soil: cracking
)
NUTRIENTS = {"nitrogen": (70, 130, 95, 85, 60), "phosphorus": (55, 70, 95, 80, 65), "potassium": (140, 170, 200, 235, 250)}


def readings_for(day: int, stress: bool) -> dict[str, float]:
    """A bed's mid-morning readings on a cycle day."""
    stage = guava.stage_of(day)
    low, high = guava.moisture_band(stage, stress)
    wave = math.sin(day / 3.3)
    out = {
        "soil_moisture": (low + high) / 2 + wave * (high - low) * 0.15,
        "soil_ph": 6.3 + 0.1 * math.sin(day / 7),
        "soil_ec": sum(stage.ec) / 2 + 0.05 * wave,
        "soil_temperature": 25.0, "air_temperature": 26.5, "air_humidity": 68.0,
        **{k: float(v[stage.n - 1]) for k, v in NUTRIENTS.items()},
    }
    for first, last, change in EVENTS:
        if first <= day <= last:
            out.update(change)
    return {k: round(v, 2) for k, v in out.items()}


def canopy_for(day: int) -> float:
    """Leaf cover the rover would see: stress sheds it, the flush builds it, then it holds."""
    if day <= 45:
        return 0.42 - 0.004 * day
    if day <= 75:
        return 0.24 + 0.008 * (day - 45)
    return 0.48


def tree_rows(rows: int, cols: int, base: dict[str, float], canopy: float, spread: float, rng: random.Random, block: str = "") -> list[dict]:
    """Trees of one round. Moisture falls along each row, as on a drip line losing pressure towards the far end.
    What a tree is does not change from day to day: a gap stays a gap, a sick tree stays sick, a small tree stays small."""
    out = []
    for r in range(rows):
        for c in range(cols):
            tree = random.Random(f"{block}-{r}-{c}")
            gap, sick, size, yellow = tree.random() < 0.05, tree.random() < 0.1, tree.uniform(0.82, 1.15), tree.uniform(0.15, 0.30)
            if gap:
                out.append({"row": r, "col": c, "plant": False, "canopy": 0.0, "chlorosis": 0.0, "flagged": False, "readings": {}})
                continue
            along = c / max(cols - 1, 1) - 0.5
            readings = {k: round(v + rng.gauss(0, 0.03 * max(1.0, abs(v))), 2) for k, v in base.items()}
            readings["soil_moisture"] = round(base["soil_moisture"] - along * spread + rng.gauss(0, spread * 0.25), 1)
            chlorosis = round(yellow, 3) if sick else 0.0
            out.append({"row": r, "col": c, "plant": True, "canopy": round(max(0.04, canopy * size * rng.uniform(0.98, 1.02)), 3),
                        "chlorosis": chlorosis, "flagged": sick, "readings": readings})
    return out


async def backfill_rounds(session: AsyncSession, farm_name: str, now: datetime | None = None) -> int:
    """The last two weeks of rounds for every growing bed, once: a farm with any survey already is left alone."""
    now = now or utcnow()
    farm = await session.scalar(select(Farm).where(Farm.name == farm_name))
    if farm is None or await session.scalar(select(func.count()).select_from(SurveyMission)):
        return 0
    tz = ZoneInfo(farm.timezone)
    today = now.astimezone(tz).date()
    beds = (await session.execute(select(Planting, Zone).join(Zone, Planting.zone_id == Zone.id)
                                  .where(Zone.farm_id == farm.id, Planting.ended_on.is_(None)))).all()
    added = 0
    for planting, zone in beds:
        if not planting.plant_count:
            continue
        rng = random.Random(zone.name)
        rows, cols = grid_for(planting.plant_count)
        setup = guava.SETUP_BY_ID.get(planting.setup or "")
        stress = planting.regulation == "withhold"
        for back in range(ROUNDS - 1, -1, -1):
            date = today - timedelta(days=back)
            day = guava.days_between(planting.planted_on, date)
            if day < 1:
                continue
            at = datetime.combine(date, time(7, 0), tzinfo=tz)
            if at > now:
                at = now - timedelta(minutes=5)
            low, high = guava.moisture_band(guava.stage_of(day), stress)
            trees = tree_rows(rows, cols, readings_for(day, stress), canopy_for(day), max(3.0, (high - low) * 0.9), rng, zone.name)
            seen = [t for t in trees if t["plant"]]
            await store_report(session, {
                "missionId": str(uuid.uuid4()), "zoneId": zone.name, "status": "completed", "abortReason": None, "simulated": True,
                "cellsScanned": len(trees), "cellsTotal": len(trees), "plantsDetected": len(seen), "cellsFlagged": sum(t["flagged"] for t in seen),
                "distanceM": 0.0, "estDurationS": None, "startedAt": at.isoformat(), "finishedAt": (at + timedelta(minutes=20)).isoformat() if back else at.isoformat(),
                "grid": {"rows": rows, "cols": cols, "cellM": setup.tree_m if setup else 3.0, "rowM": setup.row_m if setup else 3.0}, "cells": trees,
            })
            added += 1
    return added
