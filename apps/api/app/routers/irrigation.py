from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/zones", tags=["irrigation"])


class ManualCommand(BaseModel):
    command: str = Field(pattern="^(ON|OFF)$")
    channel: int = Field(default=1, ge=1, le=4)
    max_on_seconds: int = Field(default=60, ge=1, le=180)


@router.post("/{zone_id}/irrigation", status_code=202)
async def manual_irrigation(zone_id: str, cmd: ManualCommand):
    """
    Manual override. Returns 202 and 'pending_confirmation' on purpose: the
    valve is only reported as changed once the device says so.
    """
    return {
        "zoneId": zone_id,
        "status": "pending_confirmation",
        "note": "State will be reported by the device.",
        "command": cmd.model_dump(),
    }
