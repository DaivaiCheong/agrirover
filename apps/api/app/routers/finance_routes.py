import csv
import io
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.config import settings
from app.core.db import get_db
from app.services import farm_service, finance_service
from app.services.errors import Invalid, NotFound

router = APIRouter()
Currency = Literal["USD", "KHR"]
CATEGORIES = {
    "seed", "fertilizer", "pesticide", "materials", "water_energy",
    "labour_hired", "labour_family", "services", "repairs", "interest", "overhead", "other",
}


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class WorkbookRowIn(BaseModel):
    id: str
    rowNum: int
    label: str
    unit: str
    roverQty: float = Field(ge=0)
    stdQty: float = Field(ge=0)
    unitRateUsd: float = Field(ge=0)
    qtyDecimals: int = 2
    rateDecimals: int = 2
    customRoverQty: bool = False
    customStdQty: bool = False
    note: str = ""


class WorkbookIn(BaseModel):
    plants: int = Field(ge=1, le=1_000_000)
    cycleDays: int = Field(ge=1, le=365)
    exchangeRate: float = Field(ge=100, le=100_000)
    yieldKgPerPlant: float = Field(ge=0, le=100)
    sellingPricePerKg: float = Field(ge=0, le=1_000)
    riskProtectedUsd: float = Field(ge=0, le=1_000_000)
    rows: list[WorkbookRowIn]


class CostIn(_Camel):
    planting_id: str | None = None
    entry_date: date = Field(alias="date")
    category: str
    description: str | None = Field(None, max_length=160)
    qty: float | None = Field(None, ge=0)
    unit: str | None = Field(None, max_length=16)
    unit_price: float | None = Field(None, ge=0)
    amount: float | None = Field(None, ge=0)
    currency: Currency = "USD"


class StockItemIn(_Camel):
    name: str = Field(min_length=1, max_length=80)
    category: str
    unit: str = Field(min_length=1, max_length=16)


class StockInMove(_Camel):
    move_date: date = Field(alias="date")
    qty: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    currency: Currency = "USD"


class StockUseMove(_Camel):
    move_date: date = Field(alias="date")
    qty: float = Field(gt=0)
    planting_id: str


class AssetIn(_Camel):
    name: str = Field(min_length=1, max_length=100)
    cost_usd: float = Field(gt=0)
    bought_on: date
    life_years: float = Field(gt=0, le=50)
    salvage_usd: float = Field(default=0, ge=0)


# ---- Interactive Excel Finance Workbook (NoSQL MongoDB persistence) ----

@router.get("/finance/spreadsheet", tags=["finance"])
async def get_spreadsheet(farm: str | None = None, db=Depends(get_db)):
    return await finance_service.get_workbook(db, farm or settings.farm_name)


@router.put("/finance/spreadsheet", tags=["finance"])
async def put_spreadsheet(body: WorkbookIn, farm: str | None = None, db=Depends(get_db)):
    return await finance_service.save_workbook(db, farm or settings.farm_name, body.model_dump())


@router.post("/finance/spreadsheet/reset", tags=["finance"])
async def reset_spreadsheet(farm: str | None = None, db=Depends(get_db)):
    return await finance_service.reset_workbook(db, farm or settings.farm_name)


@router.get("/finance/sample", tags=["finance"])
async def sample_status(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    sample = await db.costs.count_documents({"farmName": fname, "sample": True})
    real = await db.costs.count_documents({"farmName": fname, "sample": {"$ne": True}})
    return {"sample": sample, "real": real}


@router.delete("/finance/sample", tags=["finance"])
async def sample_remove(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    await db.costs.delete_many({"farmName": fname, "sample": True})
    real = await db.costs.count_documents({"farmName": fname, "sample": {"$ne": True}})
    return {"sample": 0, "real": real}


# ---- Cost Entries CRUD ----

@router.get("/costs", tags=["costs"])
async def list_costs(cycle: str | None = None, limit: int = Query(500, ge=1, le=2000), farm: str | None = None, db=Depends(get_db)):
    q: dict = {"farmName": farm or settings.farm_name}
    if cycle:
        q["plantingId"] = cycle
    return await db.costs.find(q, {"_id": 0, "farmName": 0}).sort("date", -1).limit(limit).to_list(length=limit)


@router.post("/costs", status_code=201, tags=["costs"])
async def add_cost(body: CostIn, farm: str | None = None, db=Depends(get_db)):
    if body.category not in CATEGORIES:
        raise Invalid(f"unknown category {body.category!r}")
    fname = farm or settings.farm_name
    farm_doc = await farm_service.get_farm_doc(db, fname)
    rate = float(farm_doc["settings"].get("khrPerUsd") or 4080)
    amount = body.amount if body.amount is not None else round((body.qty or 0) * (body.unit_price or 0), 2)
    amount_usd = amount if body.currency == "USD" else round(amount / rate, 2)
    doc = {
        "id": f"cost-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "plantingId": body.planting_id,
        "date": body.entry_date.isoformat(),
        "category": body.category,
        "description": body.description,
        "qty": body.qty,
        "unit": body.unit,
        "unitPrice": body.unit_price,
        "amount": amount,
        "currency": body.currency,
        "amountUsd": amount_usd,
        "rateUsed": rate,
        "source": "ledger",
        "sample": False,
    }
    await db.costs.insert_one(dict(doc))
    doc.pop("farmName", None)
    return doc


@router.delete("/costs/{entry_id}", status_code=204, tags=["costs"])
async def delete_cost(entry_id: str, farm: str | None = None, db=Depends(get_db)):
    res = await db.costs.delete_one({"farmName": farm or settings.farm_name, "id": entry_id})
    if res.deleted_count == 0:
        raise NotFound("cost entry not found")


# ---- Stock Inventory & Moves ----

@router.get("/stock/items", tags=["stock"])
async def list_stock(farm: str | None = None, db=Depends(get_db)):
    return await db.stock_items.find({"farmName": farm or settings.farm_name}, {"_id": 0, "farmName": 0}).sort("name", 1).to_list(length=200)


@router.post("/stock/items", status_code=201, tags=["stock"])
async def add_stock_item(body: StockItemIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    doc = {
        "id": f"stk-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "name": body.name.strip(),
        "category": body.category,
        "unit": body.unit,
        "qtyOnHand": 0.0,
        "avgUnitCostUsd": 0.0,
        "valueUsd": 0.0,
    }
    await db.stock_items.insert_one(dict(doc))
    doc.pop("farmName", None)
    return doc


@router.post("/stock/items/{item_id}/in", tags=["stock"])
async def stock_in(item_id: str, body: StockInMove, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    item = await db.stock_items.find_one({"farmName": fname, "id": item_id}, {"_id": 0})
    if item is None:
        raise NotFound("stock item not found")
    farm_doc = await farm_service.get_farm_doc(db, fname)
    rate = float(farm_doc["settings"].get("khrPerUsd") or 4080)
    unit_usd = body.unit_price if body.currency == "USD" else round(body.unit_price / rate, 4)

    old_qty = float(item["qtyOnHand"])
    old_val = float(item["valueUsd"])
    add_val = round(body.qty * unit_usd, 2)
    new_qty = round(old_qty + body.qty, 3)
    new_val = round(old_val + add_val, 2)
    new_avg = round(new_val / new_qty, 4) if new_qty > 0 else unit_usd

    updated = await db.stock_items.find_one_and_update(
        {"id": item_id},
        {"$set": {"qtyOnHand": new_qty, "valueUsd": new_val, "avgUnitCostUsd": new_avg}},
        projection={"_id": 0, "farmName": 0},
        return_document=True,
    )
    await db.stock_moves.insert_one({
        "id": f"mv-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "itemId": item_id,
        "date": body.move_date.isoformat(),
        "kind": "in",
        "qty": body.qty,
        "unitCostUsd": round(unit_usd, 2),
        "plantingId": None,
    })
    return updated


@router.post("/stock/items/{item_id}/use", status_code=201, tags=["stock"])
async def stock_use(item_id: str, body: StockUseMove, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    item = await db.stock_items.find_one({"farmName": fname, "id": item_id}, {"_id": 0})
    if item is None:
        raise NotFound("stock item not found")
    if body.qty > float(item["qtyOnHand"]):
        raise Invalid("not enough quantity on hand")
    unit_cost = float(item["avgUnitCostUsd"])
    new_qty = round(float(item["qtyOnHand"]) - body.qty, 3)
    new_val = round(max(0.0, float(item["valueUsd"]) - body.qty * unit_cost), 2)
    updated = await db.stock_items.find_one_and_update(
        {"id": item_id},
        {"$set": {"qtyOnHand": new_qty, "valueUsd": new_val}},
        projection={"_id": 0, "farmName": 0},
        return_document=True,
    )
    move_id = f"mv-{uuid.uuid4().hex[:8]}"
    await db.stock_moves.insert_one({
        "id": move_id,
        "farmName": fname,
        "itemId": item_id,
        "date": body.move_date.isoformat(),
        "kind": "out",
        "qty": body.qty,
        "unitCostUsd": round(unit_cost, 2),
        "plantingId": body.planting_id,
    })
    return {"item": updated}


@router.get("/stock/items/{item_id}/moves", tags=["stock"])
async def stock_moves(item_id: str, farm: str | None = None, db=Depends(get_db)):
    return await db.stock_moves.find({"farmName": farm or settings.farm_name, "itemId": item_id}, {"_id": 0, "farmName": 0, "itemId": 0}).sort("date", -1).to_list(length=200)


@router.delete("/stock/moves/{move_id}", status_code=204, tags=["stock"])
async def undo_move(move_id: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    mv = await db.stock_moves.find_one({"farmName": fname, "id": move_id})
    if mv is None:
        raise NotFound("stock move not found")
    if mv["kind"] == "out":
        item = await db.stock_items.find_one({"id": mv["itemId"]})
        if item:
            new_qty = round(float(item["qtyOnHand"]) + float(mv["qty"]), 3)
            new_val = round(float(item["valueUsd"]) + float(mv["qty"]) * float(mv["unitCostUsd"]), 2)
            await db.stock_items.update_one({"id": mv["itemId"]}, {"$set": {"qtyOnHand": new_qty, "valueUsd": new_val}})
    await db.stock_moves.delete_one({"id": move_id})


# ---- Equipment Assets ----

@router.get("/assets", tags=["assets"])
async def list_assets(farm: str | None = None, db=Depends(get_db)):
    return await db.assets.find({"farmName": farm or settings.farm_name}, {"_id": 0, "farmName": 0}).to_list(length=200)


@router.post("/assets", status_code=201, tags=["assets"])
async def add_asset(body: AssetIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    daily_dep = round(max(0.0, (body.cost_usd - body.salvage_usd)) / (body.life_years * 365.0), 2)
    doc = {
        "id": f"ast-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "name": body.name.strip(),
        "costUsd": body.cost_usd,
        "boughtOn": body.bought_on.isoformat(),
        "lifeYears": body.life_years,
        "salvageUsd": body.salvage_usd,
        "retiredOn": None,
        "dailyDepreciationUsd": daily_dep,
        "status": "in_service",
    }
    await db.assets.insert_one(dict(doc))
    doc.pop("farmName", None)
    return doc


@router.patch("/assets/{asset_id}/retire", tags=["assets"])
async def retire_asset(asset_id: str, farm: str | None = None, db=Depends(get_db)):
    doc = await db.assets.find_one_and_update(
        {"farmName": farm or settings.farm_name, "id": asset_id},
        {"$set": {"status": "retired", "retiredOn": date.today().isoformat()}},
        projection={"_id": 0, "farmName": 0},
        return_document=True,
    )
    if doc is None:
        raise NotFound("asset not found")
    return doc


@router.delete("/assets/{asset_id}", status_code=204, tags=["assets"])
async def delete_asset(asset_id: str, farm: str | None = None, db=Depends(get_db)):
    res = await db.assets.delete_one({"farmName": farm or settings.farm_name, "id": asset_id})
    if res.deleted_count == 0:
        raise NotFound("asset not found")


# ---- Reports & CSV Exports ----

@router.get("/reports/compare", tags=["reports"])
async def compare(a: str, b: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    ra = await finance_service.build_cop_report(db, fname, a)
    rb = await finance_service.build_cop_report(db, fname, b)
    diff = None
    if ra["copPerKg"] is not None and rb["copPerKg"] is not None:
        diff = round(ra["copPerKg"] - rb["copPerKg"], 3)
    return {"a": ra, "b": rb, "copPerKgDifference": diff}


def _csv_response(rows: list[list], filename: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in rows:
        w.writerow(r)
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/export/costs.csv", tags=["reports"])
async def export_costs(farm: str | None = None, db=Depends(get_db)):
    costs = await db.costs.find({"farmName": farm or settings.farm_name}, {"_id": 0}).sort("date", 1).to_list(length=2000)
    out = [["date", "planting_id", "category", "description", "qty", "unit", "currency", "amount", "amount_usd"]]
    for c in costs:
        out.append([c["date"], c.get("plantingId") or "", c["category"], c.get("description") or "", c.get("qty") or "", c.get("unit") or "", c["currency"], c["amount"], c["amountUsd"]])
    return _csv_response(out, "costs.csv")


@router.get("/export/cop.csv", tags=["reports"])
async def export_cop(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    cycles = await db.cycles.find({"farmName": fname}, {"_id": 0, "id": 1}).to_list(length=100)
    out = [["bed", "crop", "planted_on", "status", "total_cost_usd", "kg_marketable", "cop_per_kg_usd", "revenue_usd", "margin_usd", "cost_per_plant_usd"]]
    for cy in cycles:
        r = await finance_service.build_cop_report(db, fname, cy["id"])
        c = r["cycle"]
        out.append([c["bedLabel"], c["cropName"], c["plantedOn"], c["status"], r["totalCostUsd"], r["kgMarketable"], r["copPerKg"] or "", r["revenueUsd"], r["marginUsd"] or "", r["costPerPlant"] or ""])
    return _csv_response(out, "cop.csv")
