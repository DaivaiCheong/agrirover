from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import CropProfile
from app.services import crops as crop_svc
from app.services import water_plan as wp
from app.services.clock import farm_today

router = APIRouter(prefix="/water-plan", tags=["water-plan"])


class PlanIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    crop: str = "tomato"
    plants: int = Field(gt=0, le=1_000_000)
    area_per_plant_m2: float = Field(0.5, gt=0, le=100)
    et0_mm_day: float = Field(gt=0, le=15)
    efficiency: float = Field(0.9, gt=0, le=1)
    stage_days: list[int] | None = Field(None, min_length=4, max_length=4)
    planted_on: date | None = None
    today: date | None = None                      # default: today in Cambodia

    @field_validator("stage_days")
    @classmethod
    def _positive_days(cls, v):
        if v is not None and any(x < 1 or x > 400 for x in v):
            raise ValueError("each stage must be between 1 and 400 days")
        return v


def _row(r: wp.DayRow) -> dict:
    return {"day": r.day, "stage": r.stage, "kc": round(r.kc, 4), "etcMm": round(r.etc_mm, 3),
            "litersPerPlantNet": round(r.liters_per_plant_net, 3),
            "litersPerPlantGross": round(r.liters_per_plant_gross, 3),
            "litersTotalGross": round(r.liters_total_gross, 1)}


@router.get("/crops")
async def crops(session: AsyncSession = Depends(get_db)):
    """Crops that have water data, with their numbers and where those came from."""
    rows = (await session.execute(select(CropProfile).order_by(CropProfile.common_name))).scalars().all()
    out = []
    for r in rows:
        w = crop_svc.water_data(r)
        if w:
            out.append({"id": w.id, "name": w.name, "kc": {"ini": w.kc_ini, "mid": w.kc_mid, "end": w.kc_end},
                        "stageDays": list(w.stage_days), "source": w.source})
    return out


@router.post("")
async def make_plan(body: PlanIn, session: AsyncSession = Depends(get_db)):
    crop = await crop_svc.load_crop(session, body.crop)
    p = wp.plan(crop, body.plants, body.area_per_plant_m2, body.et0_mm_day, body.efficiency, body.stage_days)
    today = body.today or farm_today()
    now_row = wp.position(p, body.planted_on, today) if body.planted_on else None
    return {
        "crop": crop.name,
        "source": crop.source,
        "cycleDays": p.cycle_days,
        "netM3": round(p.net_m3, 3),
        "grossM3": round(p.gross_m3, 3),
        "peakLitersPerDay": round(p.peak_liters_per_day, 1),
        "today": _row(now_row) if now_row else None,
        "stages": _stage_totals(p),
        "assumptions": {"plants": p.plants, "areaPerPlantM2": p.area_per_plant_m2, "et0MmDay": p.et0_mm_day,
                        "efficiency": p.efficiency, "stageDays": list(p.stage_days),
                        "rainIgnored": True},
        "days": [_row(r) for r in p.days],
    }


def _stage_totals(p: wp.WaterPlan) -> list[dict]:
    out = []
    for name in wp.STAGES:
        rows = [r for r in p.days if r.stage == name]
        out.append({"stage": name, "days": len(rows),
                    "grossM3": round(sum(r.liters_total_gross for r in rows) / 1000, 3)})
    return out
