"""Idempotent NoSQL MongoDB seeder for the 100%-Tomato AgriRover G1–G6 farm."""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.db import ensure_indexes, get_database
from app.core.security import hash_password
from app.services.clock import farm_today
from app.services.tomato import CYCLE_DAYS, DEFAULT_PRICE_USD_PER_KG, KHR_PER_USD, SLUG, NAME

BED_SPECS = [
    {
        "zone": "g1",
        "label": "G1 Greenhouse North",
        "areaM2": 400.0,
        "rows": 4,
        "cols": 4,
        "rowM": 5.0,
        "treeM": 5.0,
        "day": 32,
        "variety": "Roma Tomato",
        "setup": "greenhouse_a",
        "setupLabel": "Greenhouse Trellis Beds",
        "trialArm": "guided",
        "basePh": 6.4,
        "baseMoisture": 64.5,
        "baseEc": 1.45,
        "baseSoilTemp": 23.8,
        "npk": [110, 75, 185],
        "soilProfile": {"texture": "Sandy loam", "rootingDepthCm": 65, "drainage": "Well drained", "organicMatterPct": 2.8},
        "emptyCells": [[3, 3]],
        "attentionCells": [
            {"row": 1, "col": 1, "reason": "yellow"},
            {"row": 2, "col": 1, "reason": "blight"},
        ],
    },
    {
        "zone": "g2",
        "label": "G2 Commercial Bed A",
        "areaM2": 105.0,
        "rows": 2,
        "cols": 5,
        "rowM": 3.0,
        "treeM": 3.5,
        "day": 48,
        "variety": "Cherry Belle",
        "setup": "commercial",
        "setupLabel": "Drip Row Commercial",
        "trialArm": "usual",
        "basePh": 6.35,
        "baseMoisture": 65.0,
        "baseEc": 1.50,
        "baseSoilTemp": 24.4,
        "npk": [125, 80, 190],
        "soilProfile": {"texture": "Loam", "rootingDepthCm": 55, "drainage": "Well drained", "organicMatterPct": 3.1},
        "emptyCells": [],
        "attentionCells": [
            {"row": 0, "col": 4, "reason": "curl", "moisture": 54.2, "ec": 1.25},
            {"row": 1, "col": 1, "reason": "yellow", "nitrogen": 64},
        ],
    },
    {
        "zone": "g3",
        "label": "G3 Raised Beds B",
        "areaM2": 60.0,
        "rows": 2,
        "cols": 5,
        "rowM": 3.0,
        "treeM": 2.0,
        "day": 64,
        "variety": "San Marzano",
        "setup": "raised_bed",
        "setupLabel": "Raised Mulched Beds",
        "trialArm": None,
        "basePh": 6.45,
        "baseMoisture": 67.8,
        "baseEc": 1.75,
        "baseSoilTemp": 24.1,
        "npk": [100, 90, 220],
        "soilProfile": {"texture": "Clay loam", "rootingDepthCm": 50, "drainage": "Moderately well drained", "organicMatterPct": 3.4},
        "emptyCells": [],
        "attentionCells": [
            {"row": 0, "col": 2, "reason": "blight"},
            {"row": 1, "col": 3, "reason": "blossom", "ph": 5.75},
        ],
    },
    {
        "zone": "g4",
        "label": "G4 Drip Plot C",
        "areaM2": 50.0,
        "rows": 5,
        "cols": 5,
        "rowM": 2.0,
        "treeM": 1.0,
        "day": 78,
        "variety": "Beefsteak",
        "setup": "drip_plot",
        "setupLabel": "High-density Drip Plot",
        "trialArm": None,
        "basePh": 6.25,
        "baseMoisture": 66.5,
        "baseEc": 1.90,
        "baseSoilTemp": 25.0,
        "npk": [95, 85, 235],
        "soilProfile": {"texture": "Sandy loam", "rootingDepthCm": 45, "drainage": "Well drained", "organicMatterPct": 2.6},
        "emptyCells": [[0, 4]],
        "attentionCells": [
            {"row": 2, "col": 2, "reason": "pest"},
            {"row": 4, "col": 4, "reason": "dry", "moisture": 54.0},
        ],
    },
    {
        "zone": "g5",
        "label": "G5 Harvest Bed",
        "areaM2": 105.0,
        "rows": 2,
        "cols": 5,
        "rowM": 3.0,
        "treeM": 3.5,
        "day": 96,
        "variety": "Roma Tomato",
        "setup": "commercial",
        "setupLabel": "Drip Row Commercial",
        "trialArm": None,
        "basePh": 6.35,
        "baseMoisture": 61.5,
        "baseEc": 2.10,
        "baseSoilTemp": 24.6,
        "npk": [102, 72, 200],
        "soilProfile": {"texture": "Loam", "rootingDepthCm": 60, "drainage": "Well drained", "organicMatterPct": 3.0},
        "emptyCells": [],
        "attentionCells": [],
    },
    {
        "zone": "g6",
        "label": "G6 Open Field",
        "areaM2": 50.0,
        "rows": 2,
        "cols": 5,
        "rowM": 2.5,
        "treeM": 2.0,
        "day": 0,
        "variety": None,
        "setup": "open_field",
        "setupLabel": "Open Field Beds",
        "trialArm": None,
        "basePh": 6.45,
        "baseMoisture": 60.0,
        "baseEc": 1.20,
        "baseSoilTemp": 23.5,
        "npk": [88, 68, 175],
        "soilProfile": {"texture": "Sandy loam", "rootingDepthCm": 55, "drainage": "Well drained", "organicMatterPct": 2.5},
        "emptyCells": [],
        "attentionCells": [],
    },
]


def _build_cell(spec: dict, row: int, col: int, day_offset: int) -> dict:
    empty_set = {(r, c) for r, c in spec.get("emptyCells", [])}
    if (row, col) in empty_set:
        return {
            "row": row,
            "col": col,
            "plant": False,
            "flagged": False,
            "readings": {},
            "canopy": None,
            "chlorosis": None,
            "disease": None,
            "disease_confidence": None,
            "advice": None,
        }

    attn = next((a for a in spec.get("attentionCells", []) if a["row"] == row and a["col"] == col), None)
    jitter = ((row * 3 + col * 7 + day_offset) % 9 - 4) * 0.12
    n_base, p_base, k_base = spec["npk"]
    ph = attn.get("ph") if attn and "ph" in attn else round(spec["basePh"] + jitter * 0.25, 2)
    moist = attn.get("moisture") if attn and "moisture" in attn else round(spec["baseMoisture"] + jitter * 4.0 - day_offset * 0.08, 1)
    ec = attn.get("ec") if attn and "ec" in attn else round(spec["baseEc"] + jitter * 0.15, 2)
    temp = round(spec["baseSoilTemp"] + jitter * 0.4, 1)
    nitrogen = attn.get("nitrogen") if attn and "nitrogen" in attn else int(round(n_base - ((row + col) % 3)))

    canopy = round(min(0.68, 0.36 + spec["day"] * 0.002 + ((row + col) % 3) * 0.02 - day_offset * 0.003), 3)
    chlorosis = 0.02
    disease = None
    conf = None
    flagged = False
    litres = round(max(1.4, 2.2 - (moist - 62.0) * 0.08), 1)
    notes: list[str] = []

    if attn and day_offset <= 4:
        flagged = True
        reason = attn["reason"]
        if reason == "yellow":
            disease = "chlorosis"
            conf = 0.91
            chlorosis = 0.19
            notes = ["Yellowing lower leaves detected", "Evaluate Soil N & K before applying Urea"]
        elif reason == "blight":
            disease = "early_blight"
            conf = 0.85
            chlorosis = 0.08
            notes = ["Early blight concentric target spot", "Prune < 25 cm & apply Bacillus subtilis WP"]
        elif reason == "curl":
            disease = "leaf_curl"
            conf = 0.88
            chlorosis = 0.05
            litres = 2.5
            notes = [f"Leaf curl · dry root zone ({moist}%)", "Trigger precision drip pulse"]
        elif reason == "blossom":
            disease = "blossom_end_rot"
            conf = 0.89
            chlorosis = 0.04
            notes = [f"Blossom-end rot risk · pH {ph}", "Calcium foliar & avoid Phosphates"]
        elif reason == "pest":
            disease = "pest_damage"
            conf = 0.87
            chlorosis = 0.06
            notes = ["Leafminer / whitefly activity", "Spray 3 mL/L Neem oil + soap at dusk"]
        elif reason == "dry":
            litres = 2.5
            notes = [f"Dry soil moisture ({moist}%)", "Trigger irrigation pulse"]

    return {
        "row": row,
        "col": col,
        "plant": True,
        "flagged": flagged,
        "readings": {
            "soil_ph": ph,
            "soil_moisture": moist,
            "soil_ec": ec,
            "soil_temperature": temp,
            "nitrogen": nitrogen,
            "phosphorus": p_base,
            "potassium": k_base,
            "air_temperature": round(28.4 + jitter * 0.5, 1),
            "air_humidity": round(68.0 - jitter * 1.5, 1),
        },
        "canopy": canopy,
        "chlorosis": chlorosis,
        "disease": disease,
        "disease_confidence": conf,
        "advice": {
            "row": row,
            "col": col,
            "plant": True,
            "litres": litres,
            "fullLitres": round(litres / 0.72, 1),
            "notes": notes,
        },
    }


def build_default_workbook(farm_name: str, risk_protected_usd: float = 25.20) -> dict[str, Any]:
    return {
        "farmName": farm_name,
        "plants": 69,
        "cycleDays": CYCLE_DAYS,
        "exchangeRate": KHR_PER_USD,
        "yieldKgPerPlant": 4.5,
        "sellingPricePerKg": DEFAULT_PRICE_USD_PER_KG,
        "riskProtectedUsd": round(risk_protected_usd, 2),
        "rows": [
            {"id": "water", "rowNum": 2, "label": "Irrigation Water (m³)", "unit": "m³", "roverQty": 7.94, "stdQty": 11.0, "unitRateUsd": 0.55, "qtyDecimals": 2, "rateDecimals": 2, "note": "58–72% moisture-threshold precision drip (115 L/plant)"},
            {"id": "electricity", "rowNum": 3, "label": "Electricity — Drip Pump & Rover (kWh)", "unit": "kWh", "roverQty": 26.5, "stdQty": 38.0, "unitRateUsd": 0.18, "qtyDecimals": 1, "rateDecimals": 2, "note": "Shorter targeted drip pump runs & smart sensor sleep cycles"},
            {"id": "fertilizer", "rowNum": 4, "label": "Fertilizers & Soil Amendments (kg)", "unit": "kg", "roverQty": 11.2, "stdQty": 14.5, "unitRateUsd": 1.15, "qtyDecimals": 1, "rateDecimals": 2, "note": "Mulder's balance skips heavy N where probe N >= 80 mg/kg"},
            {"id": "protection", "rowNum": 5, "label": "Crop Protection & Bio-Treatments (L)", "unit": "L", "roverQty": 2.6, "stdQty": 4.2, "unitRateUsd": 2.40, "qtyDecimals": 1, "rateDecimals": 2, "note": "Spot-treats Health vision alerts rather than blanket spraying"},
            {"id": "substrate", "rowNum": 6, "label": "Seedlings, Coco-Peat & Twine (plants)", "unit": "plants", "roverQty": 69, "stdQty": 69, "unitRateUsd": 0.22, "qtyDecimals": 0, "rateDecimals": 2, "note": "Direct seedling & substrate establishment cost"},
            {"id": "labor", "rowNum": 7, "label": "Field Scouting & Labor (hours)", "unit": "hrs", "roverQty": 8.5, "stdQty": 16.0, "unitRateUsd": 1.55, "qtyDecimals": 1, "rateDecimals": 2, "note": "Autonomous morning rover rounds replace manual daily walks"},
        ],
    }


async def seed_farm(db: Any, farm_name: str | None = None) -> None:
    """Populate MongoDB collections idempotently if missing."""
    await ensure_indexes(db)
    fname = farm_name or settings.farm_name
    today = farm_today()
    now = datetime.now(timezone.utc)
    # the daily round runs at 07:00 on the farm (Cambodia time); the newest seeded one is the last 07:00 already past
    local_now = datetime.now(ZoneInfo("Asia/Phnom_Penh"))
    last_round = local_now.replace(hour=7, minute=0, second=0, microsecond=0)
    if last_round > local_now:
        last_round -= timedelta(days=1)

    # 1. Farm + Settings
    if await db.farms.find_one({"name": fname}) is None:
        await db.farms.insert_one({
            "name": fname,
            "timezone": "Asia/Phnom_Penh",
            "ownerEmail": settings.admin_email,
            "ownerPasswordHash": hash_password(settings.admin_password),
            "settings": {
                "khrPerUsd": KHR_PER_USD,
                "rateConfirmed": True,
                "familyWageUsdPerDay": 6.20,
                "waterCostPerM3Usd": 0.55,
                "landRentUsdPerHaYear": 450.0,
                "irrigationEfficiency": 0.90,
            },
        })

    # 2. Devices
    for dev in (
        {"farmName": fname, "code": "ESP-FIELD-01", "kind": "field_node", "zone": "g1", "commissioned": True, "status": "online", "link": "online", "lastSeenAt": now.isoformat(), "firmwareVersion": "1.2.0"},
        {"farmName": fname, "code": "ROVER-01", "kind": "rover", "zone": None, "commissioned": True, "status": "online", "link": "online", "lastSeenAt": now.isoformat(), "firmwareVersion": "2.1.4"},
    ):
        await db.devices.update_one({"farmName": fname, "code": dev["code"]}, {"$setOnInsert": dev}, upsert=True)

    # 3. Zones (G1–G6), Cycles, Surveys (14 days), Telemetry (72 hours)
    for spec in BED_SPECS:
        zone_name = spec["zone"]
        if await db.zones.find_one({"farmName": fname, "zone": zone_name}) is None:
            await db.zones.insert_one({
                "farmName": fname,
                "zone": zone_name,
                "label": spec["label"],
                "areaM2": spec["areaM2"],
                "soilProfile": spec["soilProfile"],
                "rain": False,
                "waterPh": 6.4,
                "supplyVoltage": 12.4,
                "moisturePct": spec["baseMoisture"],
                "recordedAt": now.isoformat(),
            })

        plant_count = (spec["rows"] * spec["cols"] - len(spec["emptyCells"])) if spec["day"] > 0 else 0
        cycle_id = f"cycle-{zone_name}"
        if plant_count > 0 and await db.cycles.find_one({"id": cycle_id}) is None:
            planted_on = (today - timedelta(days=spec["day"] - 1)).isoformat()
            await db.cycles.insert_one({
                "id": cycle_id,
                "farmName": fname,
                "zone": zone_name,
                "bedLabel": spec["label"],
                "trialArm": spec["trialArm"],
                "crop": SLUG,
                "cropName": NAME,
                "variety": spec["variety"],
                "plantedOn": planted_on,
                "endedOn": None,
                "status": "active",
                "plantCount": plant_count,
                "areaM2": spec["areaM2"],
                "setup": spec["setup"],
                "setupLabel": spec["setupLabel"],
                "expectedPriceUsdPerKg": DEFAULT_PRICE_USD_PER_KG,
                "grid": {"rows": spec["rows"], "cols": spec["cols"], "rowM": spec["rowM"], "treeM": spec["treeM"]},
                "jobsDone": [],
                "fruitMm": 48.0 if spec["day"] >= 60 else None,
            })

            # Seed 14 daily completed surveys per active bed (newest first when queried)
            for d_off in range(14):
                started = (last_round - timedelta(days=d_off)).astimezone(timezone.utc)
                finished = started + timedelta(minutes=14)
                cells = [
                    _build_cell(spec, r, c, d_off)
                    for r in range(spec["rows"])
                    for c in range(spec["cols"])
                ]
                flagged_cnt = sum(1 for cell in cells if cell["flagged"])
                sid = f"round-{zone_name}-d{d_off:02d}"
                if await db.surveys.find_one({"id": sid}) is None:
                    await db.surveys.insert_one({
                        "id": sid,
                        "farmName": fname,
                        "zone": zone_name,
                        "bedLabel": spec["label"],
                        "status": "completed",
                        "abortReason": None,
                        "simulated": False,
                        "rows": spec["rows"],
                        "cols": spec["cols"],
                        "cellM": spec["treeM"],
                        "cellsScanned": len(cells),
                        "plantsDetected": plant_count,
                        "cellsFlagged": flagged_cnt,
                        "distanceM": round(len(cells) * spec["treeM"], 1),
                        "estDurationS": 840,
                        "startedAt": started.isoformat(),
                        "finishedAt": finished.isoformat(),
                        "cells": cells,
                    })

        # Seed 72 hours of hourly telemetry per zone if absent
        existing_tel = await db.telemetry.count_documents({"farmName": fname, "zone": zone_name})
        if existing_tel == 0:
            n_val, p_val, k_val = spec["npk"]
            tel_docs = []
            for h in range(72):
                ts = (now - timedelta(hours=71 - h)).replace(minute=0, second=0, microsecond=0)
                wave = math.sin(h * 0.25)
                readings = {
                    "soil_moisture": round(spec["baseMoisture"] + wave * 1.8, 1),
                    "soil_ph": round(spec["basePh"] + wave * 0.05, 2),
                    "soil_ec": round(spec["baseEc"] + wave * 0.08, 2),
                    "soil_temperature": round(spec["baseSoilTemp"] + wave * 1.4, 1),
                    "nitrogen": float(n_val),
                    "phosphorus": float(p_val),
                    "potassium": float(k_val),
                    "air_temperature": round(27.5 + math.sin((h - 6) * math.pi / 12) * 3.5, 1),
                    "air_humidity": round(70.0 - math.sin((h - 6) * math.pi / 12) * 8.0, 1),
                }
                for metric, val in readings.items():
                    tel_docs.append({
                        "farmName": fname,
                        "zone": zone_name,
                        "metric": metric,
                        "ts": ts.isoformat(),
                        "value": val,
                    })
            if tel_docs:
                await db.telemetry.insert_many(tel_docs)

    # 4. Finance Workbook (interactive Excel calculator persistence)
    if await db.finance_workbooks.find_one({"farmName": fname}) is None:
        await db.finance_workbooks.insert_one(build_default_workbook(fname))

    # 5. Stock Inventory
    if await db.stock_items.count_documents({"farmName": fname}) == 0:
        stock_seed = [
            {"id": "stk-ca-no3", "farmName": fname, "name": "Calcium Nitrate (15.5-0-0)", "category": "fertilizer", "unit": "kg", "qtyOnHand": 25.0, "avgUnitCostUsd": 1.15, "valueUsd": 28.75},
            {"id": "stk-k2so4", "farmName": fname, "name": "Potassium Sulfate (0-0-50 K2SO4)", "category": "fertilizer", "unit": "kg", "qtyOnHand": 18.0, "avgUnitCostUsd": 1.25, "valueUsd": 22.50},
            {"id": "stk-bacillus", "farmName": fname, "name": "Bacillus subtilis WP (Bio-fungicide)", "category": "pesticide", "unit": "kg", "qtyOnHand": 2.4, "avgUnitCostUsd": 6.50, "valueUsd": 15.60},
            {"id": "stk-neem", "farmName": fname, "name": "Cold-pressed Neem Oil", "category": "pesticide", "unit": "L", "qtyOnHand": 4.0, "avgUnitCostUsd": 4.80, "valueUsd": 19.20},
            {"id": "stk-seaweed", "farmName": fname, "name": "Liquid Seaweed + Chelated Micros", "category": "fertilizer", "unit": "L", "qtyOnHand": 5.0, "avgUnitCostUsd": 3.40, "valueUsd": 17.00},
            {"id": "stk-seed", "farmName": fname, "name": "Tomato F1 Seedlings & Coco-Peat", "category": "seed", "unit": "plants", "qtyOnHand": 80.0, "avgUnitCostUsd": 0.22, "valueUsd": 17.60},
        ]
        await db.stock_items.insert_many(stock_seed)

    # 6. Equipment Assets
    if await db.assets.count_documents({"farmName": fname}) == 0:
        await db.assets.insert_many([
            {"id": "ast-rover", "farmName": fname, "name": "AgriRover Autonomous Scout & Spray Unit", "costUsd": 420.0, "boughtOn": (today - timedelta(days=90)).isoformat(), "lifeYears": 5, "salvageUsd": 60.0, "retiredOn": None, "dailyDepreciationUsd": 0.20, "status": "in_service"},
            {"id": "ast-drip", "farmName": fname, "name": "Solar Drip Manifold, Pump & Soil Sensors", "costUsd": 260.0, "boughtOn": (today - timedelta(days=90)).isoformat(), "lifeYears": 4, "salvageUsd": 30.0, "retiredOn": None, "dailyDepreciationUsd": 0.16, "status": "in_service"},
        ])

    # 7. Harvests & Sales for maturing blocks G3–G5
    if await db.harvests.count_documents({"farmName": fname}) == 0:
        await db.harvests.insert_many([
            {"id": "harv-g3-1", "farmName": fname, "cycleId": "cycle-g3", "zone": "g3", "date": (today - timedelta(days=5)).isoformat(), "kgTotal": 14.5, "kgMarketable": 13.8, "kgHome": 0.5, "kgLost": 0.2, "note": "First early truss pick", "sample": False},
            {"id": "harv-g4-1", "farmName": fname, "cycleId": "cycle-g4", "zone": "g4", "date": (today - timedelta(days=3)).isoformat(), "kgTotal": 32.0, "kgMarketable": 30.6, "kgHome": 0.8, "kgLost": 0.6, "note": "Beefsteak ripening round", "sample": False},
            {"id": "harv-g5-1", "farmName": fname, "cycleId": "cycle-g5", "zone": "g5", "date": (today - timedelta(days=2)).isoformat(), "kgTotal": 28.4, "kgMarketable": 27.6, "kgHome": 0.5, "kgLost": 0.3, "note": "Peak harvest bed Grade A", "sample": False},
        ])
    if await db.sales.count_documents({"farmName": fname}) == 0:
        await db.sales.insert_many([
            {"id": "sale-g3-1", "farmName": fname, "cycleId": "cycle-g3", "zone": "g3", "date": (today - timedelta(days=4)).isoformat(), "kg": 13.8, "pricePerKg": 0.85, "currency": "USD", "amountUsd": 11.73, "buyer": "Phnom Penh Fresh Market", "sample": False},
            {"id": "sale-g4-1", "farmName": fname, "cycleId": "cycle-g4", "zone": "g4", "date": (today - timedelta(days=2)).isoformat(), "kg": 30.6, "pricePerKg": 0.82, "currency": "USD", "amountUsd": 25.09, "buyer": "Green Grocer Co-op", "sample": False},
            {"id": "sale-g5-1", "farmName": fname, "cycleId": "cycle-g5", "zone": "g5", "date": (today - timedelta(days=1)).isoformat(), "kg": 27.6, "pricePerKg": 0.85, "currency": "USD", "amountUsd": 23.46, "buyer": "Direct Restaurant Contract", "sample": False},
        ])

    # 8. Initial Costs ledger
    if await db.costs.count_documents({"farmName": fname}) == 0:
        await db.costs.insert_many([
            {"id": "cost-seed-all", "farmName": fname, "plantingId": "cycle-g1", "date": (today - timedelta(days=31)).isoformat(), "category": "seed", "description": "G1 Roma seedlings & coco-peat plugs (15 plants)", "qty": 15, "unit": "plants", "unitPrice": 0.22, "amount": 3.30, "currency": "USD", "amountUsd": 3.30, "rateUsed": KHR_PER_USD, "source": "manual", "sample": False},
            {"id": "cost-fert-g2", "farmName": fname, "plantingId": "cycle-g2", "date": (today - timedelta(days=10)).isoformat(), "category": "fertilizer", "description": "Calcium Nitrate & K2SO4 drip amendments", "qty": 1.6, "unit": "kg", "unitPrice": 1.15, "amount": 1.84, "currency": "USD", "amountUsd": 1.84, "rateUsed": KHR_PER_USD, "source": "manual", "sample": False},
            {"id": "cost-bio-g3", "farmName": fname, "plantingId": "cycle-g3", "date": (today - timedelta(days=6)).isoformat(), "category": "pesticide", "description": "Bacillus subtilis WP + Calcium Chloride foliar spot spray", "qty": 0.6, "unit": "L", "unitPrice": 2.40, "amount": 1.44, "currency": "USD", "amountUsd": 1.44, "rateUsed": KHR_PER_USD, "source": "manual", "sample": False},
        ])

    # 9. Leaf sample example
    if await db.leaf_tests.count_documents({"farmName": fname}) == 0:
        await db.leaf_tests.insert_one({
            "id": "leaf-g1-1",
            "farmName": fname,
            "zone": "g1",
            "zoneLabel": "G1 Greenhouse North",
            "variety": "Roma Tomato",
            "takenOn": (today - timedelta(days=4)).isoformat(),
            "cropDay": 28,
            "stage": "Flowering & early fruit set",
            "atBloom": True,
            "tree": "R2 T2",
            "leafPairs": 8,
            "collectedBy": "Farm Operator",
            "note": "Lower canopy check; confirmed soil N = 109 mg/kg adequate",
            "lab": "Phnom Penh Agro Lab",
            "resultsOn": (today - timedelta(days=2)).isoformat(),
            "results": [
                {"nutrient": "Nitrogen", "symbol": "N", "value": 4.1, "unit": "%", "inBase": 4.1, "base": "%", "status": "ok"},
                {"nutrient": "Potassium", "symbol": "K", "value": 3.4, "unit": "%", "inBase": 3.4, "base": "%", "status": "ok"},
            ],
            "low": [],
            "high": [],
            "check": [],
        })


if __name__ == "__main__":
    async def _run():
        db = get_database()
        await seed_farm(db)

    asyncio.run(_run())
