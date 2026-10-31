from fastapi import APIRouter

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.get("/{zone_id}")
async def zone_series(zone_id: str, metric: str = "soil_moisture", hours: int = 24):
    """Time series for one zone and metric."""
    return {"zoneId": zone_id, "metric": metric, "hours": hours, "points": []}
