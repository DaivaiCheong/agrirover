import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.config import settings
from app.core.db import get_db
from app.services import farm_service, finance_service
from app.services.clock import farm_today
from app.services.errors import Conflict, Invalid, NotFound
from app.services.tomato import (
    DEFAULT_PRICE_USD_PER_KG,
    JOBS,
    METHOD_IDS,
    NAME,
    SETUP_BY_ID,
    SLUG,
    cycle_public_dict,
)

router = APIRouter()
Currency = Literal["USD", "KHR"]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CycleIn(_Camel):
    zone: str
    crop: str = SLUG
    planted_on: date
    trees_planted_on: date | None = None
    regulation: str | None = Field("pruning", max_length=24)
    plant_count: int | None = Field(None, gt=0, le=1_000_000)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)
    variety: str | None = Field(None, max_length=80)
    setup: str | None = Field(None, max_length=32)
    expected_price_usd_per_kg: float | None = Field(None, ge=0, le=1_000)


class CyclePatch(_Camel):
    planted_on: date | None = None
    plant_count: int | None = Field(None, gt=0, le=1_000_000)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)
    variety: str | None = Field(None, max_length=80)
    setup: str | None = Field(None, max_length=32)
    expected_price_usd_per_kg: float | None = Field(None, ge=0, le=1_000)


class CloseIn(_Camel):
    ended_on: date | None = None


class HarvestIn(_Camel):
    harvest_date: date = Field(alias="date")
    kg_total: float = Field(gt=0, le=1_000_000)
    kg_marketable: float = Field(ge=0, le=1_000_000)
    kg_home: float = Field(default=0, ge=0, le=1_000_000)
    note: str | None = Field(None, max_length=200)


class SaleIn(_Camel):
    sale_date: date = Field(alias="date")
    kg: float = Field(gt=0, le=1_000_000)
    price_per_kg: float = Field(ge=0, le=100_000)
    currency: Currency = "USD"
    buyer: str | None = Field(None, max_length=120)


class FruitIn(BaseModel):
    mm: float = Field(gt=0, le=150)


@router.get("/cycles", tags=["cycles"])
async def list_cycles(today: date | None = None, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    ref_day = today or farm_today()
    docs = await db.cycles.find({"farmName": fname}, {"_id": 0}).sort([("plantedOn", -1), ("zone", 1)]).to_list(length=200)
    return [cycle_public_dict(d, ref_day) for d in docs]


@router.post("/cycles", status_code=201, tags=["cycles"])
async def create_cycle(body: CycleIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    z = await db.zones.find_one({"farmName": fname, "zone": body.zone}, {"_id": 0})
    if z is None:
        raise NotFound(f"unknown bed {body.zone!r}")
    if body.setup and body.setup not in SETUP_BY_ID:
        raise Invalid(f"unknown setup {body.setup!r}")
    if body.regulation and body.regulation not in METHOD_IDS:
        raise Invalid(f"unknown method {body.regulation!r}")
    if await db.cycles.find_one({"farmName": fname, "zone": body.zone, "status": "active"}):
        raise Conflict(f"{z.get('label') or body.zone} already has an open cycle; close it first")

    plants = body.plant_count or 15
    cols = min(6, max(2, round(plants ** 0.5)))
    rows = max(1, (plants + cols - 1) // cols)
    setup_info = SETUP_BY_ID.get(body.setup or "commercial")
    cid = f"cycle-{body.zone}-{uuid.uuid4().hex[:6]}"
    doc = {
        "id": cid,
        "farmName": fname,
        "zone": body.zone,
        "bedLabel": z.get("label") or body.zone.upper(),
        "trialArm": None,
        "crop": SLUG,
        "cropName": NAME,
        "variety": body.variety or "Roma Tomato",
        "plantedOn": body.planted_on.isoformat(),
        "endedOn": None,
        "status": "active",
        "plantCount": plants,
        "areaM2": body.area_m2 or z.get("areaM2") or 50.0,
        "setup": body.setup or "commercial",
        "setupLabel": setup_info["label"] if setup_info else "Drip Row Commercial",
        "expectedPriceUsdPerKg": body.expected_price_usd_per_kg or DEFAULT_PRICE_USD_PER_KG,
        "grid": {"rows": rows, "cols": cols, "rowM": 3.0, "treeM": 2.0},
        "jobsDone": [],
        "fruitMm": None,
    }
    await db.cycles.insert_one(doc)
    return cycle_public_dict(doc, farm_today())


@router.patch("/cycles/{cycle_id}", tags=["cycles"])
async def update_cycle(cycle_id: str, body: CyclePatch, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    cyc = await db.cycles.find_one({"farmName": fname, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")
    patch: dict = {}
    if body.planted_on is not None:
        patch["plantedOn"] = body.planted_on.isoformat()
    if body.plant_count is not None:
        patch["plantCount"] = body.plant_count
    if body.area_m2 is not None:
        patch["areaM2"] = body.area_m2
    if body.variety is not None:
        patch["variety"] = body.variety
    if body.setup is not None:
        if body.setup not in SETUP_BY_ID:
            raise Invalid(f"unknown setup {body.setup!r}")
        patch["setup"] = body.setup
        patch["setupLabel"] = SETUP_BY_ID[body.setup]["label"]
    if body.expected_price_usd_per_kg is not None:
        patch["expectedPriceUsdPerKg"] = body.expected_price_usd_per_kg
    if patch:
        cyc = await db.cycles.find_one_and_update({"id": cycle_id}, {"$set": patch}, projection={"_id": 0}, return_document=True)
    return cycle_public_dict(cyc, farm_today())


@router.post("/cycles/{cycle_id}/close", tags=["cycles"])
async def close_cycle(cycle_id: str, body: CloseIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    cyc = await db.cycles.find_one({"farmName": fname, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")
    if cyc["status"] == "closed":
        raise Conflict("this cycle is already closed")
    ended = (body.ended_on or farm_today()).isoformat()
    if ended < cyc["plantedOn"]:
        raise Invalid("a cycle cannot end before it was planted")
    cyc = await db.cycles.find_one_and_update(
        {"id": cycle_id},
        {"$set": {"status": "closed", "endedOn": ended}},
        projection={"_id": 0},
        return_document=True,
    )
    return cycle_public_dict(cyc, farm_today())


@router.get("/cycles/{cycle_id}/cop", tags=["cycles"])
async def get_cop(cycle_id: str, farm: str | None = None, db=Depends(get_db)):
    return await finance_service.build_cop_report(db, farm or settings.farm_name, cycle_id)


@router.get("/cycles/{cycle_id}/harvests", tags=["cycles"])
async def list_harvests(cycle_id: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    return await db.harvests.find({"farmName": fname, "cycleId": cycle_id}, {"_id": 0}).sort("date", -1).to_list(length=500)


@router.post("/cycles/{cycle_id}/harvests", status_code=201, tags=["cycles"])
async def add_harvest(cycle_id: str, body: HarvestIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    cyc = await db.cycles.find_one({"farmName": fname, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")
    if body.kg_marketable + body.kg_home > body.kg_total:
        raise Invalid("marketable + home kg cannot exceed total picked kg")
    doc = {
        "id": f"harv-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "cycleId": cycle_id,
        "zone": cyc["zone"],
        "date": body.harvest_date.isoformat(),
        "kgTotal": round(body.kg_total, 2),
        "kgMarketable": round(body.kg_marketable, 2),
        "kgHome": round(body.kg_home, 2),
        "kgLost": round(max(0.0, body.kg_total - body.kg_marketable - body.kg_home), 2),
        "note": body.note,
        "sample": False,
    }
    await db.harvests.insert_one(dict(doc))
    return doc


@router.delete("/harvests/{harvest_id}", status_code=204, tags=["cycles"])
async def delete_harvest(harvest_id: str, farm: str | None = None, db=Depends(get_db)):
    res = await db.harvests.delete_one({"farmName": farm or settings.farm_name, "id": harvest_id})
    if res.deleted_count == 0:
        raise NotFound("harvest not found")


@router.get("/cycles/{cycle_id}/sales", tags=["cycles"])
async def list_sales(cycle_id: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    return await db.sales.find({"farmName": fname, "cycleId": cycle_id}, {"_id": 0}).sort("date", -1).to_list(length=500)


@router.post("/cycles/{cycle_id}/sales", status_code=201, tags=["cycles"])
async def add_sale(cycle_id: str, body: SaleIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    cyc = await db.cycles.find_one({"farmName": fname, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")
    farm_doc = await farm_service.get_farm_doc(db, fname)
    rate = float(farm_doc["settings"].get("khrPerUsd") or 4080)
    amount = round(body.kg * body.price_per_kg, 2)
    amount_usd = amount if body.currency == "USD" else round(amount / rate, 2)
    doc = {
        "id": f"sale-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "cycleId": cycle_id,
        "zone": cyc["zone"],
        "date": body.sale_date.isoformat(),
        "kg": round(body.kg, 2),
        "pricePerKg": body.price_per_kg,
        "currency": body.currency,
        "amountUsd": amount_usd,
        "buyer": body.buyer,
        "sample": False,
    }
    await db.sales.insert_one(dict(doc))
    return doc


@router.delete("/sales/{sale_id}", status_code=204, tags=["cycles"])
async def delete_sale(sale_id: str, farm: str | None = None, db=Depends(get_db)):
    res = await db.sales.delete_one({"farmName": farm or settings.farm_name, "id": sale_id})
    if res.deleted_count == 0:
        raise NotFound("sale not found")


@router.get("/advice", tags=["advice"])
async def get_advice(farm: str | None = None, db=Depends(get_db)):
    return await farm_service.farm_advice(db, farm or settings.farm_name)


@router.get("/schedule", tags=["advice"])
async def get_schedule(days: int = Query(14, ge=1, le=180), farm: str | None = None, db=Depends(get_db)):
    return await farm_service.farm_schedule(db, farm or settings.farm_name, days)


@router.get("/advice/{zone}/growth", tags=["advice"])
async def get_growth(zone: str, farm: str | None = None, db=Depends(get_db)):
    res = await farm_service.bed_growth(db, farm or settings.farm_name, zone)
    if res is None:
        raise NotFound(f"unknown bed {zone!r}")
    return res


@router.get("/cycles/{cycle_id}/orchard", tags=["advice"])
@router.get("/cycles/{cycle_id}/tomato", tags=["advice"])
async def cycle_detail(cycle_id: str, farm: str | None = None, db=Depends(get_db)):
    return await farm_service.cycle_orchard_view(db, farm or settings.farm_name, cycle_id)


@router.post("/cycles/{cycle_id}/orchard/jobs/{job}/done", tags=["advice"])
async def job_done(cycle_id: str, job: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    if job not in {j["id"] for j in JOBS}:
        raise Invalid(f"unknown task {job!r}")
    await db.cycles.update_one({"farmName": fname, "id": cycle_id}, {"$addToSet": {"jobsDone": job}})
    return await farm_service.cycle_orchard_view(db, fname, cycle_id)


@router.delete("/cycles/{cycle_id}/orchard/jobs/{job}/done", tags=["advice"])
async def job_undone(cycle_id: str, job: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    if job not in {j["id"] for j in JOBS}:
        raise Invalid(f"unknown task {job!r}")
    await db.cycles.update_one({"farmName": fname, "id": cycle_id}, {"$pull": {"jobsDone": job}})
    return await farm_service.cycle_orchard_view(db, fname, cycle_id)


@router.post("/cycles/{cycle_id}/orchard/fruit", tags=["advice"])
async def fruit_size(cycle_id: str, body: FruitIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    await db.cycles.update_one({"farmName": fname, "id": cycle_id}, {"$set": {"fruitMm": body.mm}})
    return await farm_service.cycle_orchard_view(db, fname, cycle_id)
