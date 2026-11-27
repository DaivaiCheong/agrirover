from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.config import settings
from app.core.db import get_db
from app.services import farm_service
from app.services.errors import Invalid
from app.services.metrics import SPECS
from app.services.tomato import NAME, SLUG, TOMATO_SETUPS, setup_to_dict

router = APIRouter()


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class BedIn(_Camel):
    label: str = Field(min_length=1, max_length=80)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)


class SoilProfileIn(_Camel):
    texture: str = Field(min_length=1, max_length=60)
    rooting_depth_cm: float = Field(gt=0, le=500)
    drainage: str = Field(min_length=1, max_length=60)
    organic_matter_pct: float = Field(ge=0, le=100)


class SettingsIn(_Camel):
    khr_per_usd: float | None = Field(None, gt=0, le=100_000)
    family_wage_usd_per_day: float | None = Field(None, ge=0, le=10_000)
    water_cost_per_m3_usd: float | None = Field(None, ge=0, le=1_000)
    land_rent_usd_per_ha_year: float | None = Field(None, ge=0, le=1_000_000)
    irrigation_efficiency: float | None = Field(None, gt=0, le=1)


class ManualCommand(BaseModel):
    command: str = Field(pattern="^(ON|OFF)$")
    channel: int = Field(default=1, ge=1, le=4)
    max_on_seconds: int = Field(default=60, ge=1, le=180)


@router.get("/zones", tags=["zones"])
async def list_zones(farm: str | None = None, db=Depends(get_db)):
    return await farm_service.latest_zones(db, farm or settings.farm_name)


@router.post("/zones", status_code=201, tags=["zones"])
async def add_bed(body: BedIn, farm: str | None = None, db=Depends(get_db)):
    return await farm_service.add_bed(db, farm or settings.farm_name, body.label, body.area_m2)


@router.put("/zones/{zone}/profile", tags=["zones"])
async def save_zone_profile(zone: str, body: SoilProfileIn, farm: str | None = None, db=Depends(get_db)):
    return await farm_service.update_soil_profile(
        db,
        farm or settings.farm_name,
        zone,
        {
            "texture": body.texture,
            "rootingDepthCm": body.rooting_depth_cm,
            "drainage": body.drainage,
            "organicMatterPct": body.organic_matter_pct,
        },
    )


@router.post("/zones/{zone_id}/irrigation", status_code=202, tags=["irrigation"])
async def manual_irrigation(zone_id: str, cmd: ManualCommand):
    return {
        "zoneId": zone_id,
        "status": "pending_confirmation",
        "note": "State will be reported by the device.",
        "command": cmd.model_dump(),
    }


@router.get("/devices", tags=["devices"])
async def list_devices(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    return await db.devices.find({"farmName": fname}, {"_id": 0, "farmName": 0}).sort("code", 1).to_list(length=50)


@router.get("/conditions", tags=["conditions"])
async def list_conditions(farm: str | None = None, db=Depends(get_db)):
    return await farm_service.zone_conditions(db, farm or settings.farm_name)


@router.get("/decisions/today", tags=["decisions"])
async def decisions_today(farm: str | None = None, db=Depends(get_db)):
    return await farm_service.decisions_today(db, farm or settings.farm_name)


@router.get("/telemetry/{zone}", tags=["telemetry"])
async def zone_series(
    zone: str,
    metrics: str = "soil_moisture",
    hours: int = Query(24, ge=1, le=24 * 30),
    points: int = Query(96, ge=10, le=500),
    farm: str | None = None,
    db=Depends(get_db),
):
    valid_names = {m.value for m in SPECS}
    req_metrics = [m.strip() for m in metrics.split(",") if m.strip()]
    for m in req_metrics:
        if m not in valid_names:
            raise Invalid(f"unknown metric {m!r}")
    return await farm_service.zone_telemetry(db, farm or settings.farm_name, zone, req_metrics or ["soil_moisture"], hours, points)


@router.get("/farm/settings", tags=["farm"])
async def get_settings(farm: str | None = None, db=Depends(get_db)):
    doc = await farm_service.get_farm_doc(db, farm or settings.farm_name)
    return doc["settings"]


@router.put("/farm/settings", tags=["farm"])
async def put_settings(body: SettingsIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    doc = await farm_service.get_farm_doc(db, fname)
    st = dict(doc.get("settings", {}))
    updates = {
        "khrPerUsd": body.khr_per_usd,
        "familyWageUsdPerDay": body.family_wage_usd_per_day,
        "waterCostPerM3Usd": body.water_cost_per_m3_usd,
        "landRentUsdPerHaYear": body.land_rent_usd_per_ha_year,
        "irrigationEfficiency": body.irrigation_efficiency,
    }
    for k, v in updates.items():
        if v is not None:
            st[k] = v
    if body.khr_per_usd is not None:
        st["rateConfirmed"] = True
    await db.farms.update_one({"name": fname}, {"$set": {"settings": st}})
    return st


@router.get("/crops", tags=["farm"])
async def list_crops():
    return [
        {
            "slug": SLUG,
            "name": NAME,
            "hasWaterData": True,
            "defaultAreaPerPlantM2": 0.5,
            "kc": {"ini": 0.65, "mid": 1.15, "end": 0.95},
            "stageDays": [20, 28, 12, 25, 25],
            "source": "AgriRover Tomato Precision Model",
            "perennial": False,
            "harvestDays": [85, 110],
            "rainyMonths": [6, 7, 8, 9, 10],
        }
    ]


@router.get("/setups", tags=["setups"])
async def list_setups(crop: str = "tomato", area: float | None = Query(None, gt=0, le=1_000_000)):
    if crop != SLUG:
        return []
    return [setup_to_dict(s, area) for s in TOMATO_SETUPS]
