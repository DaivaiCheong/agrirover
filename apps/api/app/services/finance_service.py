"""MongoDB finance workbook persistence, cost-of-production builder, and harvest/sales helpers."""
from __future__ import annotations

from typing import Any

from app.services.clock import farm_today
from app.services.errors import NotFound
from app.services.seed import build_default_workbook
from app.services.tomato import (
    DEFAULT_PRICE_USD_PER_KG,
    EXPECTED_KG_PER_PLANT,
    KHR_PER_USD,
    LITRES_PER_PLANT_CYCLE,
    UNIT_COST_USD,
    cycle_public_dict,
    days_between,
)


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


async def get_workbook(db: Any, farm_name: str) -> dict:
    doc = await db.finance_workbooks.find_one({"farmName": farm_name}, {"_id": 0})
    alert_cnt = await live_risk_alert_count(db, farm_name)
    if doc is None:
        doc = build_default_workbook(farm_name, round(alert_cnt * 3.60, 2))
        await db.finance_workbooks.insert_one(dict(doc))
    return doc


async def save_workbook(db: Any, farm_name: str, payload: dict) -> dict:
    doc = {**payload, "farmName": farm_name}
    await db.finance_workbooks.update_one({"farmName": farm_name}, {"$set": doc}, upsert=True)
    return doc


async def reset_workbook(db: Any, farm_name: str) -> dict:
    alert_cnt = await live_risk_alert_count(db, farm_name)
    doc = build_default_workbook(farm_name, round(alert_cnt * 3.60, 2))
    await db.finance_workbooks.update_one({"farmName": farm_name}, {"$set": doc}, upsert=True)
    return doc


async def build_cop_report(db: Any, farm_name: str, cycle_id: str) -> dict:
    cyc = await db.cycles.find_one({"farmName": farm_name, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        cyc = await db.cycles.find_one({"farmName": farm_name, "zone": cycle_id}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")

    farm = await db.farms.find_one({"name": farm_name}, {"_id": 0}) or {}
    khr_rate = float(farm.get("settings", {}).get("khrPerUsd") or KHR_PER_USD)

    plants = cyc.get("plantCount") or 0
    area = float(cyc.get("areaM2") or 50.0)
    today = farm_today()
    days = days_between(cyc["plantedOn"], today)

    harvests = await db.harvests.find({"farmName": farm_name, "cycleId": cyc["id"]}, {"_id": 0}).to_list(length=500)
    sales = await db.sales.find({"farmName": farm_name, "cycleId": cyc["id"]}, {"_id": 0}).to_list(length=500)
    costs = await db.costs.find({"farmName": farm_name, "plantingId": cyc["id"], "deleted": {"$ne": True}}, {"_id": 0}).to_list(length=500)

    kg_total = round(sum(h.get("kgTotal", 0) for h in harvests), 1)
    kg_mkt = round(sum(h.get("kgMarketable", 0) for h in harvests), 1)
    kg_home = round(sum(h.get("kgHome", 0) for h in harvests), 1)
    kg_lost = round(sum(h.get("kgLost", 0) for h in harvests), 1)
    rev_usd = round(sum(s.get("amountUsd", 0) for s in sales), 2)

    budget_usd = round(plants * UNIT_COST_USD, 2) if plants > 0 else 0.0
    spent_logged = round(sum(c.get("amountUsd", 0) for c in costs), 2)
    total_cost_usd = budget_usd if budget_usd > 0 else spent_logged

    lines = [
        {"category": "seed", "label": "Seedlings, Substrate & Scouting Labor", "amountUsd": round(plants * 0.41, 2), "sharePct": 50, "estimate": False},
        {"category": "fertilizer", "label": "Fertilizers & Soil Amendments", "amountUsd": round(plants * 0.187, 2), "sharePct": 23, "estimate": False},
        {"category": "water_energy", "label": "Precision Drip Water & Pump Power", "amountUsd": round(plants * 0.133, 2), "sharePct": 16, "estimate": False},
        {"category": "pesticide", "label": "Targeted Bio-Treatments", "amountUsd": round(plants * 0.09, 2), "sharePct": 11, "estimate": False},
    ]

    expected_kg = round(plants * EXPECTED_KG_PER_PLANT, 1)
    water_m3 = round((plants * LITRES_PER_PLANT_CYCLE) / 1000.0, 2)
    cop_per_kg = round(total_cost_usd / kg_mkt, 2) if kg_mkt > 0 else None
    breakeven = round(total_cost_usd / expected_kg, 2) if expected_kg > 0 else None

    return {
        "cycle": cycle_public_dict(cyc, today),
        "currency": "USD",
        "khrPerUsd": khr_rate,
        "lines": lines,
        "totalCostUsd": total_cost_usd,
        "days": days,
        "open": cyc.get("status") == "active",
        "kgTotal": kg_total,
        "kgMarketable": kg_mkt,
        "kgHome": kg_home,
        "kgLost": kg_lost,
        "revenueUsd": rev_usd,
        "marginUsd": round(rev_usd - total_cost_usd, 2) if rev_usd > 0 else None,
        "copPerKg": cop_per_kg,
        "breakEvenPricePerKg": breakeven,
        "costPerPlant": UNIT_COST_USD if plants > 0 else None,
        "costPerM2": round(total_cost_usd / area, 3) if area > 0 else None,
        "kgPerM3Water": round(kg_total / water_m3, 1) if water_m3 > 0 and kg_total > 0 else None,
        "waterM3": water_m3,
        "costPerKgIfBenchmark": (
            {
                "atLowYield": round(total_cost_usd / (plants * 4.2), 2),
                "atHighYield": round(total_cost_usd / (plants * 4.8), 2),
            }
            if plants > 0
            else None
        ),
        "flags": [],
    }
