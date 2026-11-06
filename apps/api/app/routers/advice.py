"""What the rover's round means for today: water, feed and what to look at, and how the trees are growing."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.entities import Farm, OrchardJobDone
from app.routers._deps import farm_dep
from app.services import advice as advice_svc
from app.services import guava
from app.services.clock import farm_today
from app.services.conditions import load_snapshots
from app.services.errors import Invalid, NotFound
from app.services.farm_data import cycle_dict, load_cycle
from app.services.rule_engine import utcnow
from app.services.schedule import farm_schedule

router = APIRouter(tags=["advice"])


@router.get("/advice")
async def farm_advice(session: AsyncSession = Depends(get_db)):
    """Each growing bed's day, from its newest fresh round. Advice only: nothing here opens a valve."""
    return await advice_svc.farm_advice(session, settings.farm_name)


@router.get("/schedule")
async def schedule(days: int = Query(14, ge=1, le=180), session: AsyncSession = Depends(get_db)):
    """Water, feed, tasks and stage changes by date, for every growing block."""
    return await farm_schedule(session, days)


@router.get("/advice/{zone}/growth")
async def growth(zone: str, session: AsyncSession = Depends(get_db)):
    out = await advice_svc.bed_growth(session, zone, settings.farm_name)
    if out is None:
        raise NotFound(f"unknown bed {zone!r}")
    return out


async def _orchard_view(session: AsyncSession, farm: Farm, cycle_id: str) -> dict:
    p, zone, crop = await load_cycle(session, farm, cycle_id)
    today = farm_today()
    now = utcnow()
    day = guava.days_between(p.planted_on, today)
    stage = guava.stage_of(day)
    snap = (await load_snapshots(session, farm.name, now, zone.name))[0]
    bed = {"zone": zone.name, "label": zone.label, "areaM2": float(zone.area_m2) if zone.area_m2 else None, "crop": crop.slug,
           "cropName": crop.common_name, "variety": p.variety, "day": day,
           "recordedAt": max((r.at for m, r in snap.readings.items() if m in guava.META), default=None), **snap.assess(now)}
    bed["recordedAt"] = bed["recordedAt"].isoformat() if bed["recordedAt"] else None
    done = await advice_svc.jobs_done(session, p.id)
    setup = guava.SETUP_BY_ID.get(p.setup or "")
    advice = await advice_svc.farm_advice(session, farm.name, now, zone.name)
    return {
        "cycle": cycle_dict(p, zone, crop, today), "day": day, "stages": [s.to_dict() for s in guava.STAGES], "stage": stage.to_dict(),
        "conditions": bed, "jobs": guava.jobs_for(day, done, p.regulation), "fertigation": guava.fertigation_for(stage.n),
        "rules": list(guava.PARAM_RULES), "leafRanges": guava.LEAF_RANGES, "advice": advice[0] if advice else None,
        "fruitMm": float(p.fruit_mm) if p.fruit_mm is not None else None, "bagged": "bag" in done,
        "setup": setup.to_dict() if setup else None, "docIssues": guava.DOC_ISSUES,
    }


@router.get("/cycles/{cycle_id}/orchard")
async def orchard(cycle_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    return await _orchard_view(session, farm, cycle_id)


@router.post("/cycles/{cycle_id}/orchard/jobs/{job}/done")
async def job_done(cycle_id: str, job: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    p = (await load_cycle(session, farm, cycle_id))[0]
    if job not in guava.JOB_IDS:
        raise Invalid(f"unknown task {job!r}")
    if await session.get(OrchardJobDone, (p.id, job)) is None:
        session.add(OrchardJobDone(planting_id=p.id, job_id=job))
        await session.commit()
    return await _orchard_view(session, farm, cycle_id)


class FruitIn(BaseModel):
    mm: float = Field(gt=0, le=150)


@router.post("/cycles/{cycle_id}/orchard/fruit")
async def fruit_size(cycle_id: str, body: FruitIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    p = (await load_cycle(session, farm, cycle_id))[0]
    p.fruit_mm = body.mm
    await session.commit()
    return await _orchard_view(session, farm, cycle_id)
