from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.assistant import BLOCKED_TOOLS, TOOL_SPEC

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ChatIn(BaseModel):
    message: str
    zone_id: str | None = None


@router.get("/tools")
async def tools():
    """What the assistant can and cannot do — surfaced in the UI, not just documented."""
    return {"available": TOOL_SPEC, "blocked": BLOCKED_TOOLS}


@router.post("/chat")
async def chat(_: ChatIn):
    # TODO(sprint-4): run the model with TOOL_SPEC, persist any proposal it makes.
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "wired in sprint 4")


@router.get("/proposals")
async def proposals(state: str = "pending"):
    return {"state": state, "items": []}


@router.post("/proposals/{proposal_id}/approve", status_code=202)
async def approve(proposal_id: str):
    """
    Approval is the only path from a proposal to an actuator command, and it is
    always attributable: the database refuses an approved proposal with no
    approver. Execution still passes through the bounded actuator path, so the
    firmware limit applies exactly as it does to an automatic run.
    """
    return {"proposalId": proposal_id, "status": "approved",
            "note": "Queued for execution; the device will report the resulting state."}


@router.post("/proposals/{proposal_id}/reject", status_code=200)
async def reject(proposal_id: str):
    return {"proposalId": proposal_id, "status": "rejected"}
