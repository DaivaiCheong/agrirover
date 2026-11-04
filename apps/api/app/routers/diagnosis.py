from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.services import diagnosis
from app.services.errors import Invalid

router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


@router.get("/symptoms")
async def symptoms():
    """The symptoms that can be set against live readings, for a picker."""
    return [{"id": k, "title": v} for k, v in diagnosis.SYMPTOMS.items()]


@router.get("")
async def cross_check(zone: str, symptom: str, farm: str | None = None, session: AsyncSession = Depends(get_db)):
    """A symptom you can see, set against one bed's live soil and air readings. Works without the disease
    model: the symptom is the one you name. Triage, not a diagnosis."""
    if symptom not in diagnosis.SYMPTOMS:
        raise Invalid(f"unknown symptom {symptom!r}; choose one of {', '.join(diagnosis.SYMPTOMS)}")
    return {**await diagnosis.diagnose(session, farm or settings.farm_name, zone, symptom), "source": "named"}
