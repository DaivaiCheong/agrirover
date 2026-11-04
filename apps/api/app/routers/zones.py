from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.services.registry import latest_by_zone

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("")
async def list_zones(farm: str | None = None, session: AsyncSession = Depends(get_db)):
    """Zones with their newest reading of each metric (null when nothing has arrived)."""
    return await latest_by_zone(session, farm or settings.farm_name)
