"""Loaders shared by routers and services."""
from __future__ import annotations

import math

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CropProfile, Farm, FarmSetting, Planting, Zone
from app.services import guava
from app.services.errors import NotFound


def as_uuid(value: str, what: str = "record") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise NotFound(f"{what} not found") from None


async def active_plantings(session: AsyncSession, zone_ids: list) -> dict:
    """{zone_id: (Planting, CropProfile)} for the open cycle of each zone. If a zone somehow has
    two open cycles, the newest planting wins."""
    if not zone_ids:
        return {}
    out: dict = {}
    for planting, crop in (await session.execute(
            select(Planting, CropProfile).join(CropProfile, Planting.crop_id == CropProfile.id)
            .where(Planting.zone_id.in_(zone_ids), Planting.ended_on.is_(None))
            .order_by(Planting.planted_on))).all():
        out[planting.zone_id] = (planting, crop)
    return out


async def farm_settings(session: AsyncSession, farm: Farm) -> FarmSetting:
    row = await session.get(FarmSetting, farm.id)
    if row is None:
        row = FarmSetting(farm_id=farm.id)
        session.add(row)
        await session.flush()
    return row


async def load_cycle(session: AsyncSession, farm: Farm, cycle_id: str):
    """(Planting, Zone, CropProfile) of one of this farm's cycles."""
    row = (await session.execute(
        select(Planting, Zone, CropProfile)
        .join(Zone, Planting.zone_id == Zone.id).join(CropProfile, Planting.crop_id == CropProfile.id)
        .where(Planting.id == as_uuid(cycle_id, "cycle"), Zone.farm_id == farm.id))).first()
    if row is None:
        raise NotFound("cycle not found")
    return row


def grid_for(trees: int) -> tuple[int, int]:
    """Rows and trees per row that hold this many trees, as near square as divides evenly."""
    rows = max(r for r in range(1, int(math.sqrt(trees)) + 1) if trees % r == 0)
    return rows, trees // rows


def _perennial(p: Planting, today: date) -> dict:
    started = p.planted_on
    harvest_from = started + timedelta(days=guava.HARVEST_DAYS[0] - 1)
    harvest_to = started + timedelta(days=guava.HARVEST_DAYS[1] - 1)
    middle = started + timedelta(days=round(sum(guava.HARVEST_DAYS) / 2) - 1)
    planted = p.trees_planted_on or started
    return {"treesPlantedOn": planted.isoformat(), "treeAgeYears": round((today - planted).days / 365, 1), "regulation": p.regulation,
            "regulationLabel": guava.method_label(p.regulation), "stress": p.regulation == "withhold", "harvestFrom": harvest_from.isoformat(),
            "harvestTo": harvest_to.isoformat(), "rainyHarvest": middle.month in guava.RAINY_MONTHS}


def cycle_dict(p: Planting, zone: Zone, crop: CropProfile, today: date) -> dict:
    day = guava.days_between(p.planted_on, today) if p.ended_on is None else None
    stage = guava.stage_of(day) if day is not None and day >= 1 else None
    setup = guava.SETUP_BY_ID.get(p.setup or "")
    grid = grid_for(p.plant_count) if p.plant_count else None
    price = float(p.expected_price_usd_per_kg) if p.expected_price_usd_per_kg is not None else None
    return {
        "id": str(p.id), "zone": zone.name, "bedLabel": zone.label or zone.name,
        "trialArm": zone.trial_arm.value if zone.trial_arm else None,
        "crop": crop.slug, "cropName": crop.common_name, "variety": p.variety,
        "plantedOn": p.planted_on.isoformat(), "endedOn": p.ended_on.isoformat() if p.ended_on else None,
        "status": "active" if p.ended_on is None else "closed",
        "day": day, "stage": stage.key if stage else None, "stageTitle": stage.title if stage else None,
        "plantCount": p.plant_count, "areaM2": float(p.area_m2) if p.area_m2 is not None else None,
        "setup": setup.id if setup else None, "setupLabel": setup.label if setup else None,
        "expectedPriceUsdPerKg": price,
        # what the setup says this many plants should give; None until a setup and a plant count are known
        "forecast": setup.forecast(p.plant_count, price) if setup and p.plant_count else None,
        "perennial": _perennial(p, today),
        "grid": None if grid is None else {"rows": grid[0], "cols": grid[1], "rowM": setup.row_m if setup else 3.0, "treeM": setup.tree_m if setup else 3.0},
    }
