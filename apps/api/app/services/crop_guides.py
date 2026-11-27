"""Which disease guide a photo is checked against: guava's, or tomato's on a tomato block.

A block's crop is its open guava cycle if it has one; otherwise the crop on its plant map, when that is tomato.
Anything else is checked as guava, as before.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Farm, PlantMap, Planting, Zone
from app.services import guava_diseases, tomato, tomato_diseases


@dataclass(frozen=True)
class Guide:
    crop: str                       # slug: guava | tomato
    name: str                       # "a guava leaf or fruit"
    normal: str                     # what is normal and must not be called a problem
    diseases: tuple
    prompt: str                     # the guide as the AI reads it
    by_id: dict = field(default_factory=dict)


GUAVA = Guide("guava", "Guava", "Natural speckles on guava skin are fine.", guava_diseases.DISEASES,
              guava_diseases.prompt_text(), guava_diseases.BY_ID)
TOMATO = Guide("tomato", "Tomato", "Fine hairs on tomato leaves and stems, and a pale green on young growth, are normal.",
               tomato_diseases.DISEASES, tomato_diseases.prompt_text(), tomato_diseases.BY_ID)
GUIDES = {g.crop: g for g in (GUAVA, TOMATO)}


def guide_for(crop: str | None) -> Guide:
    return TOMATO if tomato.is_tomato(crop) else GUAVA


async def crop_of_zone(session: AsyncSession, farm_name: str, zone_name: str) -> str:
    """guava or tomato. An open guava cycle wins; then a tomato plant map; anything else is guava."""
    zone = await session.scalar(select(Zone).join(Farm, Zone.farm_id == Farm.id).where(Farm.name == farm_name, Zone.name == zone_name))
    if zone is None:
        return GUAVA.crop
    if await session.scalar(select(Planting.id).where(Planting.zone_id == zone.id, Planting.ended_on.is_(None)).limit(1)):
        return GUAVA.crop
    crop = await session.scalar(select(PlantMap.crop).where(PlantMap.zone_id == zone.id))
    return TOMATO.crop if tomato.is_tomato(crop) else GUAVA.crop
