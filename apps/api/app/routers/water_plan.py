from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.services import water_plan as wp

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

    @field_validator("crop")
    @classmethod
    def _known_crop(cls, v: str) -> str:
        if v not in wp.CROPS:
            raise ValueError(f"unknown crop {v!r}; choose from {sorted(wp.CROPS)}")
        return v

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
async def crops():
    return [{"id": c.id, "name": c.name, "kc": {"ini": c.kc_ini, "mid": c.kc_mid, "end": c.kc_end},
             "stageDays": list(c.stage_days), "source": c.source} for c in wp.CROPS.values()]


@router.post("")
async def make_plan(body: PlanIn):
    crop = wp.CROPS[body.crop]
    p = wp.plan(crop, body.plants, body.area_per_plant_m2, body.et0_mm_day, body.efficiency, body.stage_days)
    today = body.today or datetime.now(ZoneInfo("Asia/Phnom_Penh")).date()
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
