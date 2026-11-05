"""The farm grows one crop: guava. The crop row exists so costs and cycles have something to point at."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CropProfile
from app.services import guava
from app.services.errors import Invalid, NotFound


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48].strip("-")
    if not slug:
        raise Invalid("give a name with letters or numbers")
    return slug


def crop_dict() -> dict:
    return {"slug": guava.SLUG, "name": "Guava", "hasWaterData": True, "defaultAreaPerPlantM2": 10.5,
            "kc": {"ini": 0.75, "mid": 0.93, "end": 1.1}, "stageDays": [s.last_day - s.first_day + 1 for s in guava.STAGES],
            "source": guava.SOURCE, "perennial": True, "regulationMethods": list(guava.METHODS),
            "harvestDays": list(guava.HARVEST_DAYS), "rainyMonths": list(guava.RAINY_MONTHS)}


async def get_crop(session: AsyncSession, slug: str) -> CropProfile:
    row = (await session.execute(select(CropProfile).where(CropProfile.slug == slug))).scalar_one_or_none()
    if row is None:
        raise NotFound(f"unknown crop {slug!r}")
    return row
