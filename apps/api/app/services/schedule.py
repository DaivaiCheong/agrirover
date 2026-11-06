"""The farm's plan by date: water, feed, tasks and stage changes for every growing block. Advice only: nothing here opens a valve.

Later days cannot know the soil, so a planned day's water is the most the block could need at that stage and month. Today's
comes from the rover's round. A feed date is the plan: on the day, high EC can still hold it.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import Farm, Planting, Zone
from app.services import advice as advice_svc
from app.services import advisor, climate, guava
from app.services.clock import farm_today
from app.services.farm_data import farm_settings

PRIMING_DAYS = (46, 49)
JOB_KIND = {"zn_b": "foliar", "k_set": "foliar", "mg_fe": "foliar", "boron": "foliar", "leaf_test": "test", "priming": "water", "hold": "water",
            "basal": "feed", "micronutrients": "feed", "stop_n": "feed", "pick": "harvest", "bag": "fruit"}


def water_day(on: date, day: int, *, trees: int, area_per_tree: float, efficiency: float, stress: bool) -> dict | None:
    """One block's most water on one date. None outside the cycle."""
    if day < 1 or day > guava.CYCLE_DAYS:
        return None
    stage = guava.stage_of(day)
    full = advisor.full_demand_litres(stage, climate.et0_on(on), area_per_tree, efficiency, stress) * trees
    kind = "hold" if stress and stage.n == 1 else "priming" if day in PRIMING_DAYS else "planned"
    return {"date": on.isoformat(), "day": day, "stage": stage.short, "litres": round(full), "kind": kind}


def events_for(start: date, days: int, *, zone: str, label: str, planted_on: date, today_day: int, done: set[str], regulation: str | None,
               setup: guava.Setup | None, trees: int) -> list[dict]:
    """Everything dated for one block from `start` for `days`. A task still overdue is kept, however old."""
    base = {"zone": zone, "label": label}
    on_day = lambda d: planted_on + timedelta(days=d - 1)  # noqa: E731
    end = start + timedelta(days=days - 1)
    out: list[dict] = []

    for job in guava.jobs_for(today_day, done, regulation):
        first, last = on_day(job["firstDay"]), on_day(job["lastDay"])
        if job["state"] in ("done", "past") or (first > end) or (last < start and job["state"] != "overdue"):
            continue
        out.append({**base, "date": first.isoformat(), "lastDate": last.isoformat(), "firstDay": job["firstDay"], "lastDay": job["lastDay"],
                    "kind": JOB_KIND.get(job["id"], "task"), "title": job["title"], "detail": job["detail"], "state": job["state"], "confirm": job["confirm"]})

    for offset in range(days):
        on = start + timedelta(days=offset)
        day = guava.days_between(planted_on, on)
        if day < 1 or day > guava.CYCLE_DAYS:
            continue
        stage = guava.stage_of(day)
        if day == stage.first_day:
            out.append({**base, "date": on.isoformat(), "lastDate": None, "firstDay": day, "lastDay": day, "kind": "stage", "title": f"Stage starts: {stage.title}",
                        "detail": f"{stage.water} {stage.feed}", "state": "later", "confirm": False})
        if advisor.feed_due(stage, day)[0]:
            dose = advisor.feed_dose(stage, setup, trees)
            total = dose["total"] if dose else None
            tanks = "; ".join(f"{t['name']}: {', '.join(t['products'])}" for t in guava.fertigation_for(stage.n)["tanks"])
            amount = f"N {total['n']} g, P {total['p']} g, K {total['k']} g" if total else "No setup: no dose"
            out.append({**base, "date": on.isoformat(), "lastDate": None, "firstDay": day, "lastDay": day, "kind": "feed", "title": f"Feed: {amount}",
                        "detail": f"{tanks}. High EC on the day holds it. Starting dose.", "state": "due" if on == start else "later", "confirm": False})
        if day == guava.CYCLE_DAYS:
            out.append({**base, "date": on.isoformat(), "lastDate": None, "firstDay": day, "lastDay": day, "kind": "stage", "title": "Cycle ends",
                        "detail": "Close the cycle and start the next.", "state": "later", "confirm": False})
    return out


async def farm_schedule(session: AsyncSession, days: int = 14, today: date | None = None) -> dict:
    today = today or farm_today()
    farm = await session.scalar(select(Farm).where(Farm.name == settings.farm_name))
    out = {"start": today.isoformat(), "days": days, "roundTime": settings.rover_round_time, "dates": [(today + timedelta(days=i)).isoformat() for i in range(days)],
           "blocks": [], "events": []}
    if farm is None:
        return out
    efficiency = float((await farm_settings(session, farm)).irrigation_efficiency)
    advice = {a["zone"]: a for a in await advice_svc.farm_advice(session, settings.farm_name)}
    beds = (await session.execute(select(Planting, Zone).join(Zone, Planting.zone_id == Zone.id).where(Zone.farm_id == farm.id, Planting.ended_on.is_(None)).order_by(Zone.name))).all()
    for p, zone in beds:
        trees = p.plant_count or 0
        area = float(p.area_m2 or zone.area_m2 or 0)
        per_tree = area / trees if trees and area else 0.0
        stress = p.regulation == "withhold"
        label = zone.label or zone.name
        today_day = guava.days_between(p.planted_on, today)
        water = []
        for offset in range(days):
            on = today + timedelta(days=offset)
            cell = water_day(on, guava.days_between(p.planted_on, on), trees=trees, area_per_tree=per_tree, efficiency=efficiency, stress=stress)
            water.append(cell)
        a = advice.get(zone.name)
        if a and a["surveyed"] and water and water[0]:
            water[0] = {**water[0], "litres": round(a["water"]["litres"]), "kind": "hold" if a["water"]["paused"] else "today"}
        out["blocks"].append({"zone": zone.name, "label": label, "cycleId": str(p.id), "trees": trees, "day": today_day, "stage": guava.stage_of(today_day).short, "water": water})
        out["events"] += events_for(today, days, zone=zone.name, label=label, planted_on=p.planted_on, today_day=today_day,
                                    done=await advice_svc.jobs_done(session, p.id), regulation=p.regulation, setup=guava.SETUP_BY_ID.get(p.setup or ""), trees=trees)
    out["events"].sort(key=lambda e: (e["date"], e["label"]))
    return out
