from fastapi import APIRouter

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("")
async def list_zones():
    """Zones with their latest reading and current valve state."""
    return []
