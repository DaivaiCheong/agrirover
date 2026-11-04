from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.entities import Farm, FarmSetting
from app.services.errors import NotFound


async def farm_dep(session: AsyncSession = Depends(get_db)) -> Farm:
    """The one farm of Stage 1 (login and many farms come later)."""
    farm = (await session.execute(select(Farm).where(Farm.name == settings.farm_name))).scalar_one_or_none()
    if farm is None:
        raise NotFound("the farm is not set up yet")
    return farm


async def farm_settings(session: AsyncSession, farm: Farm) -> FarmSetting:
    row = await session.get(FarmSetting, farm.id)
    if row is None:
        row = FarmSetting(farm_id=farm.id)
        session.add(row)
        await session.flush()
    return row
