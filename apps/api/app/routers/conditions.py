from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.services.conditions import bed_conditions

router = APIRouter(prefix="/conditions", tags=["conditions"])


@router.get("")
async def conditions(farm: str | None = None, session: AsyncSession = Depends(get_db)):
    """Every bed's newest soil and air readings, each rated normal / warning / critical against the crop's
    stage today, plus the alerts that are on. Advice only: nothing here opens a valve."""
    return await bed_conditions(session, farm or settings.farm_name)
