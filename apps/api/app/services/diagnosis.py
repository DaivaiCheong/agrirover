"""A symptom someone can see, set against a bed's newest readings. Triage, not a diagnosis."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import guava
from app.services.conditions import load_snapshots
from app.services.guava import match_symptom  # noqa: F401  (the photo check uses it through this module)
from app.services.rule_engine import utcnow

SYMPTOMS = {s.id: s.title for s in guava.SYMPTOMS.values()}


async def diagnose(session: AsyncSession, farm_name: str, zone_name: str, symptom: str, now: datetime | None = None) -> dict:
    """The symptom against one bed's readings. Unknown bed -> NotFound."""
    now = now or utcnow()
    snap = (await load_snapshots(session, farm_name, now, zone_name))[0]
    out = guava.correlate(symptom, snap.readings, snap.recent_min, now)
    stage = guava.stage_of(snap.day) if snap.day and snap.day >= 1 else None
    return {**out, "zone": snap.zone.name, "label": snap.zone.label,
            "stage": None if stage is None else {"key": stage.key, "title": stage.title, "day": snap.day}}
