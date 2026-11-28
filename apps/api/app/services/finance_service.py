"""Finance: the workbook (the farm's budget model) and each cycle's cost of production from what was recorded.

Two different numbers, never mixed up:
  * the BUDGET comes from the Finance workbook: its AgriRover cost per plant x the cycle's plants
  * the COST comes from the records: cost entries (typed, or from stock used), a share of farm-level entries,
    equipment depreciation, land rent and, when no water bill was entered, an ESTIMATE of water
"""
from __future__ import annotations

from datetime import date
from typing import Any

from app.services import cost
from app.services.clock import farm_today
from app.services.errors import NotFound
from app.services.seed import build_default_workbook
from app.services.tomato import CYCLE_DAYS, KHR_PER_USD, LITRES_PER_PLANT_CYCLE, cycle_public_dict, days_between


async def live_risk_alert_count(db: Any, farm_name: str) -> int:
    cycles = await db.cycles.find({"farmName": farm_name, "status": "active"}, {"_id": 0, "zone": 1}).to_list(length=100)
    total = 0
    for c in cycles:
        latest = await db.surveys.find_one(
            {"farmName": farm_name, "zone": c["zone"], "status": {"$in": ["completed", "aborted"]}},
            {"_id": 0, "cells": 1},
            sort=[("startedAt", -1)],
        )
        if latest:
            total += sum(1 for cell in latest.get("cells", []) if cell.get("plant") and cell.get("disease"))
    return total


def _strip(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k not in ("_id", "farmName")}


async def get_workbook(db: Any, farm_name: str) -> dict:
    doc = await db.finance_workbooks.find_one({"farmName": farm_name}, {"_id": 0})
    if doc is None:
        alert_cnt = await live_risk_alert_count(db, farm_name)
        doc = build_default_workbook(farm_name, round(alert_cnt * 3.60, 2))
        await db.finance_workbooks.insert_one(dict(doc))
    return _strip(doc)


async def save_workbook(db: Any, farm_name: str, payload: dict) -> dict:
    doc = {**payload, "farmName": farm_name}
    await db.finance_workbooks.update_one({"farmName": farm_name}, {"$set": doc}, upsert=True)
    return _strip(doc)


async def reset_workbook(db: Any, farm_name: str) -> dict:
    alert_cnt = await live_risk_alert_count(db, farm_name)
    doc = build_default_workbook(farm_name, round(alert_cnt * 3.60, 2))
    await db.finance_workbooks.update_one({"farmName": farm_name}, {"$set": doc}, upsert=True)
    return _strip(doc)


def workbook_per_plant(wb: dict) -> tuple[float, float]:
    """(AgriRover cost per plant, standard-farming cost per plant) from the workbook's rows."""
    plants = max(1, int(wb.get("plants") or 1))
    rover = sum(float(r.get("roverQty") or 0) * float(r.get("unitRateUsd") or 0) for r in wb.get("rows", []))
    std = sum(float(r.get("stdQty") or 0) * float(r.get("unitRateUsd") or 0) for r in wb.get("rows", []))
    return round(rover / plants, 4), round(std / plants, 4)


def _day(iso: str | None) -> date | None:
    return date.fromisoformat(iso[:10]) if iso else None


def cycle_in(c: dict) -> cost.CycleIn:
    return cost.CycleIn(c["id"], _day(c["plantedOn"]), _day(c.get("endedOn")), c.get("areaM2"), c.get("plantCount"))


def planner_water_m3(c: dict, today: date) -> float | None:
    """The water the plan gives the cycle so far: 115 L a plant over the 110-day cycle. A plan, not a meter."""
    plants = c.get("plantCount") or 0
    if plants <= 0:
        return None
    end = _day(c.get("endedOn")) or today
    days = min(days_between(c["plantedOn"], end), CYCLE_DAYS)
    return plants * LITRES_PER_PLANT_CYCLE * days / CYCLE_DAYS / 1000.0


def _r(v: float | None, n: int = 2) -> float | None:
    return None if v is None else round(v, n)


async def build_cop_report(db: Any, farm_name: str, cycle_id: str) -> dict:
    cyc = await db.cycles.find_one({"farmName": farm_name, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        cyc = await db.cycles.find_one({"farmName": farm_name, "zone": cycle_id, "status": "active"}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")

    farm = await db.farms.find_one({"name": farm_name}, {"_id": 0}) or {}
    st = farm.get("settings", {})
    khr_rate = float(st.get("khrPerUsd") or KHR_PER_USD)
    today = farm_today()

    all_cycles = await db.cycles.find({"farmName": farm_name}, {"_id": 0}).to_list(length=500)
    cycles = [cycle_in(c) for c in all_cycles]
    this = next(c for c in cycles if c.id == cyc["id"])
    entries = [
        cost.EntryIn(e["category"], float(e.get("amountUsd") or 0), _day(e["date"]), e.get("plantingId"))
        for e in await db.costs.find({"farmName": farm_name, "deleted": {"$ne": True}}, {"_id": 0}).to_list(length=5000)
        if e.get("category") in cost.CATEGORIES
    ]
    assets = [
        cost.AssetIn(float(a["costUsd"]), float(a.get("salvageUsd") or 0), float(a["lifeYears"]), _day(a["boughtOn"]),
                     _day(a.get("retiredOn")))
        for a in await db.assets.find({"farmName": farm_name}, {"_id": 0}).to_list(length=500)
    ]
    harvests = await db.harvests.find({"farmName": farm_name, "cycleId": cyc["id"]}, {"_id": 0}).to_list(length=1000)
    sales = await db.sales.find({"farmName": farm_name, "cycleId": cyc["id"]}, {"_id": 0}).to_list(length=1000)
    water_m3 = planner_water_m3(cyc, today)

    r = cost.compute_cop(
        this, cycles=cycles, entries=entries, assets=assets,
        harvests=[cost.HarvestIn(float(h["kgTotal"]), float(h["kgMarketable"]), float(h.get("kgHome") or 0)) for h in harvests],
        sales=[cost.SaleIn(float(s["kg"]), float(s["amountUsd"])) for s in sales],
        today=today,
        land_rent_per_ha_year=st.get("landRentUsdPerHaYear"),
        water_cost_per_m3=st.get("waterCostPerM3Usd"),
        water_m3=water_m3,
    )

    public = cycle_public_dict(cyc, today)
    total = r.total_cost_usd
    wb = await get_workbook(db, farm_name)
    per_plant_budget, per_plant_std = workbook_per_plant(wb)
    plants = cyc.get("plantCount") or 0
    budget = round(per_plant_budget * plants, 2) if plants else None
    logged = sum(x.amount_usd for x in r.lines if x.category in cost.CATEGORIES and not x.estimate)
    estimated = sum(x.amount_usd for x in r.lines if x.estimate)
    allocated = sum(x.amount_usd for x in r.lines if x.category in ("depreciation", "land"))

    fc = public.get("forecast")
    expected_kg = fc["kgMid"] if fc else None
    if r.open:
        break_even = total / expected_kg if expected_kg else None
    else:
        break_even = r.cop_per_kg
    cost_if = ({"atLowYield": round(total / fc["kgLow"], 3), "atHighYield": round(total / fc["kgHigh"], 3)}
               if fc and total > 0 and fc["kgLow"] > 0 else None)

    return {
        "cycle": public,
        "currency": "USD",
        "khrPerUsd": khr_rate,
        "lines": [{"category": x.category, "label": cost.CATEGORY_LABELS[x.category], "amountUsd": round(x.amount_usd, 2),
                   "sharePct": round(100 * x.amount_usd / total, 1) if total else 0, "estimate": x.estimate}
                  for x in r.lines if x.amount_usd > 0.004],
        "totalCostUsd": round(total, 2),
        "loggedUsd": round(logged, 2),
        "allocatedUsd": round(allocated, 2),
        "estimateUsd": round(estimated, 2),
        "budgetUsd": budget,
        "budgetPerPlantUsd": round(per_plant_budget, 3),
        "standardPerPlantUsd": round(per_plant_std, 3),
        "days": r.days,
        "open": r.open,
        "kgTotal": round(r.kg_total, 1),
        "kgMarketable": round(r.kg_marketable, 1),
        "kgHome": round(r.kg_home, 1),
        "kgLost": round(r.kg_lost, 1),
        "expectedKg": expected_kg,
        "revenueUsd": round(r.revenue_usd, 2),
        "marginUsd": _r(r.margin_usd),
        "copPerKg": _r(r.cop_per_kg, 3),
        "breakEvenPricePerKg": _r(break_even, 3),
        "costPerPlant": _r(r.cost_per_plant, 3),
        "costPerM2": _r(r.cost_per_m2, 3),
        "kgPerM3Water": _r(r.kg_per_m3_water, 1),
        "waterM3": _r(water_m3, 2),
        "costPerKgIfBenchmark": cost_if,
        "flags": r.flags,
    }


async def spent_by_cycle(db: Any, farm_name: str) -> dict[str, float]:
    """What was recorded against each cycle (its own entries, not shares): the quick 'spent so far'."""
    out: dict[str, float] = {}
    for e in await db.costs.find({"farmName": farm_name, "deleted": {"$ne": True}, "plantingId": {"$ne": None}},
                                 {"_id": 0, "plantingId": 1, "amountUsd": 1}).to_list(length=5000):
        out[e["plantingId"]] = round(out.get(e["plantingId"], 0.0) + float(e.get("amountUsd") or 0), 2)
    return out
