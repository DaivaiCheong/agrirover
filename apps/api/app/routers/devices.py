from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.registry import list_devices

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("")
async def devices(session: AsyncSession = Depends(get_db)):
    """Registered devices with when each was last heard from."""
    return await list_devices(session)
