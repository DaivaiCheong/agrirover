from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.services import history

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.get("/{zone}")
async def zone_series(zone: str, metrics: str = "soil_moisture", hours: int = Query(24, ge=1, le=history.MAX_HOURS),
                      points: int = Query(96, ge=10, le=500), farm: str | None = None,
                      session: AsyncSession = Depends(get_db)):
    """Readings of one bed over the last `hours`, averaged into at most `points` buckets.
    `zone` is the bed's short name (zone-a); `metrics` is a comma-separated list."""
    return await history.series(session, farm or settings.farm_name, zone, history.parse_metrics(metrics),
                                hours=hours, points=points)
