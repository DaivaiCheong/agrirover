"""Crops live in the database, so a farmer can add any crop. A crop can be planned for water
only when it has water coefficients (Kc and stage lengths)."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CropProfile
from app.services import water_plan as wp
from app.services.errors import Conflict, Invalid, NotFound


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48].strip("-")
    if not slug:
        raise Invalid("give a name with letters or numbers")
    return slug


def water_data(row: CropProfile) -> wp.CropWater | None:
    values = (row.kc_ini, row.kc_mid, row.kc_end, row.stage_ini_days, row.stage_dev_days,
              row.stage_mid_days, row.stage_late_days)
    if row.slug is None or any(v is None for v in values):
        return None
    return wp.CropWater(
        id=row.slug, name=row.common_name, kc_ini=float(row.kc_ini), kc_mid=float(row.kc_mid),
        kc_end=float(row.kc_end),
        stage_days=(row.stage_ini_days, row.stage_dev_days, row.stage_mid_days, row.stage_late_days),
        source=row.kc_source or "")


def crop_dict(row: CropProfile) -> dict:
    w = water_data(row)
    return {"slug": row.slug, "name": row.common_name, "hasWaterData": w is not None,
            "kc": {"ini": w.kc_ini, "mid": w.kc_mid, "end": w.kc_end} if w else None,
            "stageDays": list(w.stage_days) if w else None, "source": row.kc_source}


async def get_crop(session: AsyncSession, slug: str) -> CropProfile:
    row = (await session.execute(select(CropProfile).where(CropProfile.slug == slug))).scalar_one_or_none()
    if row is None:
        raise NotFound(f"unknown crop {slug!r}")
    return row


async def load_crop(session: AsyncSession, slug: str) -> wp.CropWater:
    """The crop's water numbers for the planner."""
    row = (await session.execute(select(CropProfile).where(CropProfile.slug == slug))).scalar_one_or_none()
    if row is None:
        raise Invalid(f"unknown crop {slug!r}")
    water = water_data(row)
    if water is None:
        raise Invalid(f"{row.common_name} has no water data yet")
    return water


async def create_crop(session: AsyncSession, name: str, kc: dict, stage_days: list[int],
                      source: str | None = None) -> CropProfile:
    if any(d < 1 or d > 400 for d in stage_days):
        raise Invalid("each stage must be between 1 and 400 days")
    slug = slugify(name)
    if (await session.execute(select(CropProfile).where(CropProfile.slug == slug))).scalar_one_or_none():
        raise Conflict(f"a crop named {name!r} already exists")
    row = CropProfile(
        common_name=name.strip(), slug=slug, kc_ini=kc["ini"], kc_mid=kc["mid"], kc_end=kc["end"],
        stage_ini_days=stage_days[0], stage_dev_days=stage_days[1], stage_mid_days=stage_days[2],
        stage_late_days=stage_days[3],
        kc_source=(f"{source.strip()} (entered by the farmer)" if source
                   else "Entered by the farmer, not checked against FAO."),
        opt_moisture_min_pct=30, opt_moisture_max_pct=45)        # the rule engine's defaults
    session.add(row)
    await session.commit()
    return row
