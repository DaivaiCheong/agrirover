from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.schemas.decisions import ZoneDecisionOut
from app.services.decisions import decisions_for_farm

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("/today", response_model=list[ZoneDecisionOut])
async def decisions_today(farm: str | None = None, session: AsyncSession = Depends(get_db)):
    """One decision per zone for today, taken at 06:00 farm time.
    Proposals only: nothing is opened from here."""
    decisions = await decisions_for_farm(session, farm or settings.farm_name)
    return [ZoneDecisionOut.from_decision(d) for d in decisions]
