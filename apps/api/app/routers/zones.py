from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.entities import Farm, IrrigationRule, Zone
from app.routers._deps import farm_dep
from app.services.crops import slugify
from app.services.errors import Conflict
from app.services.registry import latest_by_zone

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("")
async def list_zones(farm: str | None = None, session: AsyncSession = Depends(get_db)):
    """Zones with their newest reading of each metric (null when nothing has arrived)."""
    return await latest_by_zone(session, farm or settings.farm_name)


class BedIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    label: str = Field(min_length=1, max_length=80)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)


@router.post("", status_code=201)
async def add_bed(body: BedIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    """A new bed. Its short name (used in MQTT topics) is made from the label."""
    name = slugify(body.label)
    if (await session.execute(select(Zone).where(Zone.farm_id == farm.id, Zone.name == name))).scalar_one_or_none():
        raise Conflict(f"a bed named {body.label!r} already exists")
    zone = Zone(farm_id=farm.id, name=name, label=body.label.strip(), area_m2=body.area_m2)
    session.add(zone)
    await session.flush()
    session.add(IrrigationRule(zone_id=zone.id))                  # engine defaults
    await session.commit()
    return {"name": zone.name, "label": zone.label, "areaM2": body.area_m2}
