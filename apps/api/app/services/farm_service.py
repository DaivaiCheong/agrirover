"""MongoDB domain queries and builders for zones, conditions, advice, schedule, growth, and telemetry."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.clock import farm_today
from app.services.errors import Conflict, Invalid, NotFound
from app.services.tomato import (
    CYCLE_DAYS,
    JOBS,
    LEAF_RANGES,
    LITRES_PER_PLANT_CYCLE,
    METHOD_IDS,
    PARAM_META,
    PRECISION_SHARE,
    PARAM_RULES,
    SETUP_BY_ID,
    SLUG,
    STAGES,
    TARGETS,
    cell_advice,
    cycle_public_dict,
    days_between,
    rate_metric,
    stage_of,
)


def slugify(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", label.strip().lower()).strip("-")
    if not s:
        raise Invalid("enter a name with letters or numbers")
    return s[:32]


async def get_farm_doc(db: Any, farm_name: str) -> dict:
    doc = await db.farms.find_one({"name": farm_name}, {"_id": 0})
    if doc is None:
        raise NotFound(f"unknown farm {farm_name!r}")
    return doc


async def latest_metric_map(db: Any, farm_name: str, zone_name: str) -> dict[str, dict]:
    pipeline = [
        {"$match": {"farmName": farm_name, "zone": zone_name}},
        {"$sort": {"ts": -1}},
        {"$group": {"_id": "$metric", "value": {"$first": "$value"}, "ts": {"$first": "$ts"}}},
    ]
    docs = await db.telemetry.aggregate(pipeline).to_list(length=32)
    return {d["_id"]: {"value": d["value"], "ts": d["ts"]} for d in docs}


async def latest_zones(db: Any, farm_name: str) -> list[dict]:
    zones = await db.zones.find({"farmName": farm_name}, {"_id": 0}).sort("zone", 1).to_list(length=200)
    out: list[dict] = []
    for z in zones:
        m_map = await latest_metric_map(db, farm_name, z["zone"])
        moist = m_map.get("soil_moisture", {}).get("value", z.get("moisturePct"))
        wph = m_map.get("water_ph", {}).get("value", z.get("waterPh"))
        volt = m_map.get("supply_voltage", {}).get("value", z.get("supplyVoltage"))
        rain = bool(m_map["rain"]["value"]) if "rain" in m_map else z.get("rain")
        rec = max((v["ts"] for v in m_map.values() if v.get("ts")), default=z.get("recordedAt"))
        out.append({
            "zone": z["zone"],
            "label": z.get("label"),
            "areaM2": z.get("areaM2"),
            "moisturePct": moist,
            "rain": rain,
            "supplyVoltage": volt,
            "waterPh": wph,
            "recordedAt": rec,
            "soilProfile": z.get("soilProfile"),
        })
    return out


async def add_bed(db: Any, farm_name: str, label: str, area_m2: float | None = None) -> dict:
    name = slugify(label)
    if await db.zones.find_one({"farmName": farm_name, "zone": name}):
        raise Conflict(f"a bed named {label!r} already exists")
    # A new bed has no sensor yet: its readings stay empty until a field node or the rover reports.
    doc = {
        "farmName": farm_name,
        "zone": name,
        "label": label.strip(),
        "areaM2": area_m2,
        "soilProfile": None,
        "rain": None,
        "waterPh": None,
        "supplyVoltage": None,
        "moisturePct": None,
        "recordedAt": None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.zones.insert_one(doc)
    return {"name": doc["zone"], "label": doc["label"], "areaM2": doc["areaM2"]}


async def update_soil_profile(db: Any, farm_name: str, zone_name: str, profile: dict) -> dict:
    res = await db.zones.find_one_and_update(
        {"farmName": farm_name, "zone": zone_name},
        {"$set": {"soilProfile": profile}},
        projection={"_id": 0},
        return_document=True,
    )
    if res is None:
        raise NotFound(f"unknown bed {zone_name!r}")
    return res["soilProfile"]


async def _active_cycles_by_zone(db: Any, farm_name: str) -> dict[str, dict]:
    docs = await db.cycles.find({"farmName": farm_name, "status": "active"}, {"_id": 0}).to_list(length=200)
    return {c["zone"]: c for c in docs}


async def zone_conditions(db: Any, farm_name: str) -> list[dict]:
    today = farm_today()
    zones = await db.zones.find({"farmName": farm_name}, {"_id": 0}).sort("zone", 1).to_list(length=200)
    cyc_map = await _active_cycles_by_zone(db, farm_name)

    out: list[dict] = []
    for z in zones:
        zname = z["zone"]
        cyc = cyc_map.get(zname)
        day = days_between(cyc["plantedOn"], today) if cyc else None
        st = stage_of(day) if day else STAGES[0]
        latest_survey = await db.surveys.find_one(
            {"farmName": farm_name, "zone": zname, "status": {"$in": ["completed", "aborted"]}},
            {"_id": 0},
            sort=[("startedAt", -1)],
        )
        m_map = await latest_metric_map(db, farm_name, zname)

        # Compute plant-average telemetry from latest rover scan when available, falling back to zone series
        avg_vals: dict[str, float] = {}
        vision_alerts = 0
        if latest_survey and latest_survey.get("cells"):
            active_cells = [c for c in latest_survey["cells"] if c.get("plant")]
            for metric, _, _, _, dec in PARAM_META:
                vals = [c["readings"][metric] for c in active_cells if c.get("readings") and metric in c["readings"]]
                if vals:
                    avg_vals[metric] = round(sum(vals) / len(vals), dec)
            vision_alerts = sum(1 for c in active_cells if c.get("disease") or c.get("flagged"))

        params: list[dict] = []
        alerts: list[dict] = []
        worst = "normal"
        rec_at = latest_survey["finishedAt"] if latest_survey else z.get("recordedAt")

        for metric, label, short, unit, dec in PARAM_META:
            val = avg_vals.get(metric, m_map.get(metric, {}).get("value"))
            ts = rec_at or m_map.get(metric, {}).get("ts")
            status, direction = rate_metric(metric, val)
            if status == "critical":
                worst = "critical"
            elif status == "warning" and worst == "normal":
                worst = "warning"
            lo, hi = TARGETS[metric]
            params.append({
                "metric": metric,
                "label": label,
                "short": short,
                "unit": unit,
                "decimals": dec,
                "value": round(val, dec) if val is not None else None,
                "recordedAt": ts,
                "status": status,
                "direction": direction,
                "target": [lo, hi],
            })
            if direction is not None and val is not None:
                alerts.append({
                    "id": f"{zname}-{metric}-{direction}",
                    "severity": "critical" if status == "critical" else "warning",
                    "title": f"{'Low' if direction == 'low' else 'High'} {short}",
                    "message": f"{label} avg {round(val, dec)} {unit} outside tomato target ({lo:g}–{hi:g}).",
                    "metrics": [metric],
                })

        if vision_alerts > 0:
            if worst == "normal":
                worst = "warning"
            alerts.append({
                "id": f"{zname}-vision",
                "severity": "warning",
                "title": f"{vision_alerts} AI vision flag{'s' if vision_alerts > 1 else ''}",
                "message": "Rover camera flagged plant(s) needing inspection in Health.",
                "metrics": ["soil_moisture"],
            })

        out.append({
            "zone": zname,
            "label": z.get("label"),
            "areaM2": z.get("areaM2"),
            "crop": SLUG if cyc else None,
            "cropName": "Tomato" if cyc else None,
            "variety": cyc.get("variety") if cyc else None,
            "day": day,
            "recordedAt": rec_at,
            "rated": bool(cyc),
            "status": worst if cyc else "normal",
            "basis": "AgriRover Tomato Agronomy Standard (pH 6.0–6.8, Moisture 58–72%, EC 0.8–2.5)",
            "source": f"Rover mission {latest_survey['id']}" if latest_survey else "Field node",
            "stage": {
                "n": st["n"],
                "key": st["key"],
                "title": st["title"],
                "firstDay": st["firstDay"],
                "lastDay": st["lastDay"],
                "day": day or 1,
                "extended": False,
                "moisture": st["moisture"],
                "ec": st["ec"],
                "focus": st["actions"],
            } if cyc else None,
            "params": params,
            "alerts": alerts,
        })
    return out


async def zone_telemetry(db: Any, farm_name: str, zone_name: str, metrics_list: list[str], hours: int, points: int) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    docs = await db.telemetry.find(
        {"farmName": farm_name, "zone": zone_name, "metric": {"$in": metrics_list}, "ts": {"$gte": since}},
        {"_id": 0, "metric": 1, "ts": 1, "value": 1},
    ).sort("ts", 1).to_list(length=5000)

    series: dict[str, list[dict]] = {m: [] for m in metrics_list}
    for d in docs:
        series.setdefault(d["metric"], []).append({"t": d["ts"], "v": d["value"]})

    # Downsample cleanly if exceeding requested points
    for m, arr in series.items():
        if len(arr) > points:
            step = max(1, len(arr) // points)
            series[m] = arr[::step][:points]

    return {
        "zone": zone_name,
        "hours": hours,
        "bucketSeconds": max(60, round((hours * 3600) / max(1, points))),
        "from": since,
        "to": datetime.now(timezone.utc).isoformat(),
        "series": series,
    }


async def farm_advice(db: Any, farm_name: str, zone_filter: str | None = None) -> list[dict]:
    today = farm_today()
    query: dict[str, Any] = {"farmName": farm_name, "status": "active"}
    if zone_filter:
        query["zone"] = zone_filter
    cycles = await db.cycles.find(query, {"_id": 0}).sort("zone", 1).to_list(length=100)
    zone_docs = {z["zone"]: z for z in await latest_zones(db, farm_name)}

    out: list[dict] = []
    for c in cycles:
        z = c["zone"]
        day = days_between(c["plantedOn"], today)
        st = stage_of(day)
        latest_survey = await db.surveys.find_one(
            {"farmName": farm_name, "zone": z, "status": {"$in": ["completed", "aborted"]}},
            {"_id": 0},
            sort=[("startedAt", -1)],
        )
        cells = latest_survey.get("cells", []) if latest_survey else []
        trees = [cell.get("advice") or cell_advice(cell) for cell in cells if cell.get("plant")]
        trees = [t for t in trees if t]
        raining = bool((zone_docs.get(z) or {}).get("rain"))
        water_l = 0.0 if raining else round(sum(t.get("litres", 0) for t in trees), 1)
        full_l = round(sum(t.get("fullLitres", 0) for t in trees), 1)
        saved_l = round(max(0.0, full_l - water_l), 1)

        n_vals = [cell["readings"].get("nitrogen") for cell in cells if cell.get("plant") and cell.get("readings")]
        n_clean = [v for v in n_vals if v is not None]
        avg_n = round(sum(n_clean) / len(n_clean)) if n_clean else 100
        low_n = any(v < 80 for v in n_clean)

        if low_n:
            feed = {
                "action": "feed",
                "reason": f"Low Soil N detected (< 80 mg/kg) — spot-feed Calcium Nitrate (15.5% N).",
                "due": True,
                "nextDay": None,
                "aim": "Restore Soil N toward 95 mg/kg without blocking Ca/K",
                "nitrogen": "Spot Calcium Nitrate drip on flagged plants only",
                "notes": ["Mulder check: skip blanket Urea where neighboring N >= 105 mg/kg"],
                "dose": {"runs": 1, "perTree": {"n": 0.46, "p": 0.0, "k": 0.0}, "total": {"n": 4.6, "p": 0.0, "k": 0.0}},
                "plannedDose": None,
            }
        else:
            feed = {
                "action": "hold",
                "reason": f"Soil N averages {avg_n} mg/kg (Optimal) — hold Urea fertilizer.",
                "due": False,
                "nextDay": 4,
                "aim": "Maintain Potassium & Calcium balance via Mulder's Chart guard",
                "nitrogen": "0 g Urea added",
                "notes": [f"Avg probe N {avg_n} mg/kg already within 80–140 mg/kg band"],
                "dose": None,
                "plannedDose": None,
            }

        todo: list[dict] = []
        for cell in cells:
            if not cell.get("plant") or not (cell.get("disease") or cell.get("flagged")):
                continue
            label = f"R{cell['row'] + 1} T{cell['col'] + 1}"
            what = cell["disease"].replace("_", " ") if cell.get("disease") else "yellowing"
            todo.append({
                "kind": "vision",
                "id": f"{z}-{label}",
                "severity": "warn",
                "text": f"Inspect {what} on {c['bedLabel']} {label}",
                "detail": "; ".join((cell.get("advice") or cell_advice(cell) or {}).get("notes", [])) or None,
            })

        out.append({
            "zone": z,
            "label": c["bedLabel"],
            "cycleId": c["id"],
            "day": day,
            "stage": {"n": st["n"], "short": st["short"], "title": st["title"]},
            "surveyed": latest_survey is not None,
            "surveyedAt": latest_survey["finishedAt"] if latest_survey else None,
            "simulated": bool(latest_survey and latest_survey.get("simulated")),
            "partial": bool(latest_survey and latest_survey.get("status") == "aborted"),
            "treesSeen": len(trees),
            "treesWatered": 0 if raining else len(trees),
            "water": {
                "litres": water_l,
                "fullLitres": full_l,
                "savedLitres": saved_l,
                "hours": round(water_l / 20.0, 2),
                "emitterLph": 2.0,
                "firmwareLimitSeconds": 180,
                "raining": raining,
                "paused": raining,
                "et0": 4.2,
            },
            "feed": feed,
            "trees": trees,
            "todo": todo,
            "source": "AgriRover MongoDB Live",
        })
    return out


async def farm_schedule(db: Any, farm_name: str, days: int) -> dict:
    today = farm_today()
    dates = [(today + timedelta(days=i)).isoformat() for i in range(days)]
    advices = await farm_advice(db, farm_name)
    cycles = await db.cycles.find({"farmName": farm_name, "status": "active"}, {"_id": 0}).sort("zone", 1).to_list(length=100)
    cyc_by_zone = {c["zone"]: c for c in cycles}

    blocks: list[dict] = []
    events: list[dict] = []

    for adv in advices:
        z = adv["zone"]
        c = cyc_by_zone.get(z, {})
        # Today is what the round asked for; later days scale it by the stage's crop coefficient (Kc).
        # Without a round there is nothing to scale, so the plan stays empty instead of inventing a number.
        base_l = adv["water"]["fullLitres"] * PRECISION_SHARE if adv["water"]["raining"] else adv["water"]["litres"]
        kc_today = stage_of(adv["day"])["kc"] or 1.0
        water_series = []
        for i, iso in enumerate(dates):
            d_num = adv["day"] + i
            if d_num > CYCLE_DAYS or not adv["surveyed"]:
                water_series.append(None)
                continue
            st = stage_of(d_num)
            if i == 0 and adv["water"]["raining"]:
                water_series.append({"date": iso, "day": d_num, "stage": st["short"], "litres": 0.0, "kind": "hold"})
                continue
            litres = round(base_l * (st["kc"] or 1.0) / kc_today, 1)
            water_series.append({
                "date": iso,
                "day": d_num,
                "stage": st["short"],
                "litres": litres,
                "kind": "today" if i == 0 else "planned",
            })
        blocks.append({
            "zone": z,
            "label": adv["label"],
            "cycleId": adv["cycleId"],
            "trees": adv["treesSeen"],
            "day": adv["day"],
            "stage": adv["stage"]["short"],
            "water": water_series,
        })

        # Add live Health task events
        for td in adv["todo"]:
            events.append({
                "zone": z,
                "label": adv["label"],
                "date": today.isoformat(),
                "lastDate": (today + timedelta(days=2)).isoformat(),
                "firstDay": adv["day"],
                "lastDay": adv["day"] + 2,
                "kind": "foliar",
                "title": td["text"],
                "detail": td["detail"],
                "state": "due",
                "confirm": False,
            })

        # Add feed task only when actually needed (G2 low N)
        if adv["feed"]["due"]:
            events.append({
                "zone": z,
                "label": adv["label"],
                "date": today.isoformat(),
                "lastDate": (today + timedelta(days=4)).isoformat(),
                "firstDay": adv["day"],
                "lastDay": adv["day"] + 4,
                "kind": "feed",
                "title": f"Precision Ca(NO3)2 spot fertigation on {adv['label']}",
                "detail": adv["feed"]["reason"],
                "state": "due",
                "confirm": False,
            })

        # Add upcoming growth stage milestone transitions within window
        for st in STAGES:
            delta = st["firstDay"] - adv["day"]
            if 0 <= delta < days:
                events.append({
                    "zone": z,
                    "label": adv["label"],
                    "date": (today + timedelta(days=delta)).isoformat(),
                    "lastDate": None,
                    "firstDay": st["firstDay"],
                    "lastDay": st["lastDay"],
                    "kind": "stage",
                    "title": f"Stage {st['n']}: {st['title']}",
                    "detail": st["actions"],
                    "state": "due" if delta == 0 else "later",
                    "confirm": False,
                })

        # Harvest window notice
        if c and adv["day"] <= CYCLE_DAYS and (CYCLE_DAYS - adv["day"]) < days:
            h_delta = max(0, CYCLE_DAYS - adv["day"])
            events.append({
                "zone": z,
                "label": adv["label"],
                "date": (today + timedelta(days=h_delta)).isoformat(),
                "lastDate": None,
                "firstDay": CYCLE_DAYS,
                "lastDay": CYCLE_DAYS,
                "kind": "harvest",
                "title": f"Projected tomato cycle peak harvest ({adv['label']})",
                "detail": "Log marketable & home weights in Finance -> Harvest.",
                "state": "later",
                "confirm": False,
            })

    return {
        "start": dates[0],
        "days": days,
        "roundTime": "07:00",
        "dates": dates,
        "events": sorted(events, key=lambda e: (e["date"], e["zone"])),
        "blocks": blocks,
    }


async def bed_growth(db: Any, farm_name: str, zone: str) -> dict | None:
    z_doc = await db.zones.find_one({"farmName": farm_name, "zone": zone}, {"_id": 0})
    if z_doc is None:
        return None
    cyc = await db.cycles.find_one({"farmName": farm_name, "zone": zone, "status": "active"}, {"_id": 0})
    day = days_between(cyc["plantedOn"], farm_today()) if cyc else 1
    st = stage_of(day)

    rounds = await db.surveys.find(
        {"farmName": farm_name, "zone": zone, "status": {"$in": ["completed", "aborted"]}},
        {"_id": 0, "startedAt": 1, "finishedAt": 1, "simulated": 1, "cells": 1},
    ).sort("startedAt", 1).to_list(length=30)

    round_pts: list[dict] = []
    tree_map: dict[tuple[int, int], list[float]] = {}
    for rnd in rounds:
        cells = [c for c in rnd.get("cells", []) if c.get("plant") and c.get("canopy") is not None]
        if not cells:
            continue
        avg_c = round(sum(c["canopy"] for c in cells) / len(cells), 3)
        avg_y = round(sum((c.get("chlorosis") or 0.0) for c in cells) / len(cells), 3)
        round_pts.append({"at": rnd.get("finishedAt") or rnd["startedAt"], "canopy": avg_c, "yellow": avg_y, "simulated": False})
        for c in cells:
            tree_map.setdefault((c["row"], c["col"]), []).append(c["canopy"])

    summary = None
    if len(round_pts) >= 2:
        delta_pts = round((round_pts[-1]["canopy"] - round_pts[0]["canopy"]) * 100, 1)
        summary = {
            "canopyNow": round(round_pts[-1]["canopy"] * 100, 1),
            "changePoints": delta_pts,
            "overDays": len(round_pts),
            "verdict": "growing" if delta_pts >= 0 else "dipping",
            "word": "Expanding" if delta_pts >= 0 else "Slowing",
            "yellowNow": round(round_pts[-1]["yellow"] * 100, 1),
        }

    trees = [
        {"row": r, "col": c, "first": vals[0], "now": vals[-1]}
        for (r, c), vals in sorted(tree_map.items())
    ]

    return {"zone": zone, "label": z_doc.get("label"), "stage": st["title"], "rounds": round_pts, "summary": summary, "trees": trees}


async def decisions_today(db: Any, farm_name: str) -> list[dict]:
    zones = await latest_zones(db, farm_name)
    now = datetime.now(timezone.utc).isoformat()
    out: list[dict] = []
    for z in zones:
        m = z.get("moisturePct")
        if m is not None and m < 58.0:
            dec, txt, sec = "irrigate", "Water recommended (< 58% moisture)", 180
        else:
            dec, txt, sec = "skip", "Hold — moisture inside 58–72% target", 0
        out.append({
            "zone": z["zone"],
            "decision": dec,
            "text": txt,
            "durationSeconds": sec,
            "reason": f"Moisture {m:.1f}% vs 58.0% threshold" if m is not None else "No probe reading",
            "moisturePct": m,
            "thresholdPct": 58.0,
            "decisionAt": now,
        })
    return out


async def cycle_orchard_view(db: Any, farm_name: str, cycle_id: str) -> dict:
    cyc = await db.cycles.find_one({"farmName": farm_name, "id": cycle_id}, {"_id": 0})
    if cyc is None:
        cyc = await db.cycles.find_one({"farmName": farm_name, "zone": cycle_id}, {"_id": 0})
    if cyc is None:
        raise NotFound(f"unknown cycle {cycle_id!r}")

    today = farm_today()
    day = days_between(cyc["plantedOn"], today) if cyc["status"] == "active" else CYCLE_DAYS
    st = stage_of(day)
    conds = await zone_conditions(db, farm_name)
    cond = next((x for x in conds if x["zone"] == cyc["zone"]), None)
    advs = await farm_advice(db, farm_name, zone_filter=cyc["zone"])
    done_set = set(cyc.get("jobsDone", []))

    jobs_out = []
    for j in JOBS:
        if j["id"] in done_set:
            state = "done"
        elif j["ongoing"] and j["firstDay"] <= day <= j["lastDay"]:
            state = "ongoing" if False else "due"
        elif day > j["lastDay"]:
            state = "overdue"
        elif day >= j["firstDay"]:
            state = "due"
        else:
            state = "later"
        jobs_out.append({**j, "state": state})

    return {
        "cycle": cycle_public_dict(cyc, today),
        "day": day,
        "stages": STAGES,
        "stage": st,
        "conditions": cond,
        "jobs": jobs_out,
        "fertigation": {
            "stageN": st["n"],
            "aim": st["feed"],
            "nitrogen": "Skip Urea when Soil N >= 105 mg/kg; spot Ca(NO3)2 when N < 80 mg/kg.",
            "tanks": [
                {"name": "Tank A (Calcium)", "products": ["Calcium Nitrate 15.5-0-0", "Chelated Fe/Zn"]},
                {"name": "Tank B (Sulfates & Phosphates)", "products": ["Potassium Sulfate K2SO4", "Magnesium Sulfate MgSO4"]},
            ],
            "clash": "Never mix Calcium with Sulfates or Phosphates in the same concentrate tank.",
            "phases": [
                {"label": "Vegetative (1–20d)", "pct": 20, "what": "Root establishment"},
                {"label": "Flowering (21–48d)", "pct": 35, "what": "Truss set & K balance"},
                {"label": "Fruiting (49–110d)", "pct": 45, "what": "Heavy K2SO4 + steady Ca moisture"},
            ],
            "foliar": [{"text": "Seaweed 3.0 mL/L + Micros 1.0 g/L before 09:00 AM", "confirm": False}],
            "soil": cond["source"] if cond else None,
            "waterPh": "6.0 – 6.8",
        },
        "rules": PARAM_RULES,
        "leafRanges": LEAF_RANGES,
        "advice": advs[0] if advs else None,
        "fruitMm": cyc.get("fruitMm"),
        "bagged": False,
        "setup": SETUP_BY_ID.get(cyc.get("setup") or ""),
        "docIssues": [],
    }
