"""The crop plan: give how many plants and when, get water, season, feed and harvest."""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import Farm
from app.routers._deps import farm_dep
from app.services import crop_guide as guide_svc
from app.services import crops as crop_svc
from app.services.clock import farm_today
from app.services.errors import Invalid
from app.services.farm_data import farm_settings, load_cycle

router = APIRouter(tags=["plan"])


@router.get("/crop-plan")
async def crop_plan(
    crop: str = "tomato",
    plants: int = Query(gt=0, le=1_000_000),
    planted_on: date = Query(alias="plantedOn"),
    efficiency: float = Query(0.9, gt=0, le=1),
    row_cm: float | None = Query(None, alias="rowCm", ge=10, le=400),
    plant_cm: float | None = Query(None, alias="plantCm", ge=5, le=400),
    today: date | None = None,
    session: AsyncSession = Depends(get_db),
):
    """A plan for a planting that has not been started yet (or a what-if for one that has)."""
    water = await crop_svc.load_crop(session, crop)
    spacing = (row_cm, plant_cm) if row_cm and plant_cm else None
    return guide_svc.build_plan(crop=water, guide=guide_svc.GUIDES.get(crop), plants=plants, planted_on=planted_on,
                                today=today or farm_today(), efficiency=efficiency, spacing_cm=spacing)


@router.get("/cycles/{cycle_id}/plan")
async def cycle_plan(cycle_id: str, today: date | None = None, farm: Farm = Depends(farm_dep),
                     session: AsyncSession = Depends(get_db)):
    """The plan for a crop cycle that is running, from its own plant count, area and planting date."""
    p, _zone, row = await load_cycle(session, farm, cycle_id)
    if not p.plant_count:
        raise Invalid("add how many plants this crop has to see its water plan")
    st = await farm_settings(session, farm)
    area_per_plant = float(p.area_m2) / p.plant_count if p.area_m2 else None
    water = crop_svc.water_data(row)
    if water is None:
        raise Invalid(f"{row.common_name} has no water data yet")
    return guide_svc.build_plan(crop=water, guide=guide_svc.GUIDES.get(row.slug), plants=p.plant_count,
                                planted_on=p.planted_on, today=today or farm_today(),
                                efficiency=float(st.irrigation_efficiency), area_per_plant_m2=area_per_plant)
