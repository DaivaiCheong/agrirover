"""Glue between the rover's stored rounds and the pure advisor: what each bed needs today."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Farm, OrchardJobDone, Planting, SurveyFinding, SurveyMission, Zone
from app.services import advisor, climate, guava
from app.services.conditions import BedSnapshot, load_snapshots
from app.services.farm_data import farm_settings
from app.services.rule_engine import utcnow

GROWTH_DAYS = 30


async def jobs_done(session: AsyncSession, planting_id) -> set[str]:
    return set((await session.scalars(select(OrchardJobDone.job_id).where(OrchardJobDone.planting_id == planting_id))).all())


async def latest_round(session: AsyncSession, zone_id, now: datetime) -> tuple[SurveyMission | None, list[dict]]:
    """The bed's newest round that is still fresh, and its trees."""
    mission = await session.scalar(select(SurveyMission).where(
        SurveyMission.zone_id == zone_id, SurveyMission.status.in_(("completed", "aborted")),
        SurveyMission.completed_at >= now - guava.FRESH_FOR).order_by(SurveyMission.completed_at.desc()).limit(1))
    if mission is None:
        return None, []
    found = await session.scalars(select(SurveyFinding).where(SurveyFinding.mission_id == mission.id))
    return mission, [{"row": f.cell_row, "col": f.cell_col, "plant": f.plant_present, "flagged": f.flagged,
                      "canopy": None if f.canopy is None else float(f.canopy), "chlorosis": None if f.yellowing is None else float(f.yellowing),
                      "readings": f.readings or {}} for f in found]


def water_context(snap: BedSnapshot, today: date, efficiency: float, raining: bool) -> advisor.WaterContext:
    p = snap.planting
    stage = guava.stage_of(snap.day or 1)
    area = float(p.area_m2 or snap.zone.area_m2 or 0)
    per_tree = area / p.plant_count if p.plant_count and area else 0.0
    return advisor.WaterContext(stage=stage, stress=p.regulation == "withhold", et0=climate.et0_on(today), area_per_tree=per_tree,
                                efficiency=efficiency, raining=raining)


def advise_bed(snap: BedSnapshot, today: date, efficiency: float, raining: bool, mission: SurveyMission | None, trees: list[dict],
               assessment: dict) -> dict | None:
    """One bed's day. None for a bed with nothing growing."""
    p = snap.planting
    if p is None or snap.day is None:
        return None
    ctx = water_context(snap, today, efficiency, raining)
    setup = guava.SETUP_BY_ID.get(p.setup or "")
    rows = advisor.advise_trees(ctx, trees)
    living = [t for t in rows if t["plant"]]
    given = sum(t["litres"] for t in living)
    full = sum(t["fullLitres"] for t in living)
    lph = setup.lph if setup else 8
    most = max((t["litres"] for t in living), default=0.0)
    hours = round(most / lph, 1)
    feed = advisor.advise_feed(ctx.stage, snap.day, setup, len(living) or p.plant_count or 0,
                               _value(snap, "soil_ec"), _value(snap, "soil_ph"))
    surveyed = bool(trees)
    return {
        "zone": snap.zone.name, "label": snap.zone.label or snap.zone.name, "cycleId": str(p.id), "day": snap.day,
        "stage": {"n": ctx.stage.n, "short": ctx.stage.short, "title": ctx.stage.title},
        "surveyed": surveyed, "surveyedAt": mission.completed_at.isoformat() if mission else None, "simulated": bool(mission and mission.simulated),
        "partial": bool(mission and mission.status != "completed"),
        "treesSeen": len(living), "treesWatered": sum(1 for t in living if t["litres"] > 0),
        "water": {"litres": round(given, 0), "fullLitres": round(full, 0), "savedLitres": round(full - given, 0), "hours": hours, "emitterLph": lph,
                  "firmwareLimitSeconds": guava.FIRMWARE_LIMIT_S, "raining": raining,
                  "paused": ctx.stress and ctx.stage.n == 1, "et0": ctx.et0},
        "feed": feed, "trees": rows,
        "todo": advisor.todo(trees=rows, water_litres=given, feed=feed, stage=ctx.stage, stress=ctx.stress, raining=raining,
                             alerts=assessment["alerts"], hours=hours, firmware_limit_s=guava.FIRMWARE_LIMIT_S) if surveyed else [],
        "source": advisor.SOURCE,
    }


def _value(snap: BedSnapshot, metric: str) -> float | None:
    r = snap.readings.get(metric)
    return r.value if r else None


async def is_raining(snapshots: list[BedSnapshot], now: datetime) -> bool:
    """Any field node reporting rain in the last hour. A round's rain reading is not used: rain now is what counts."""
    return any(s.readings.get("rain") and s.readings["rain"].value >= 1 and now - s.readings["rain"].at <= timedelta(hours=1) for s in snapshots)


async def farm_advice(session: AsyncSession, farm_name: str, now: datetime | None = None, zone_name: str | None = None) -> list[dict]:
    now = now or utcnow()
    farm = await session.scalar(select(Farm).where(Farm.name == farm_name))
    if farm is None:
        return []
    today = now.astimezone(ZoneInfo(farm.timezone)).date()
    efficiency = float((await farm_settings(session, farm)).irrigation_efficiency)
    snapshots = await load_snapshots(session, farm_name, now)
    raining = await is_raining(snapshots, now)
    out = []
    for snap in snapshots:
        if zone_name is not None and snap.zone.name != zone_name:
            continue
        mission, trees = await latest_round(session, snap.zone.id, now)
        item = advise_bed(snap, today, efficiency, raining, mission, trees, snap.assess(now))
        if item:
            out.append(item)
    return out


async def advise_live_trees(session: AsyncSession, farm_name: str, zone_name: str, trees: list[dict], now: datetime | None = None) -> dict | None:
    """Advice for the trees of a round still in progress, so the map fills in as the rover moves. {(row, col): tree row}."""
    now = now or utcnow()
    farm = await session.scalar(select(Farm).where(Farm.name == farm_name))
    if farm is None:
        return None
    snapshots = await load_snapshots(session, farm_name, now, zone_name) if await session.scalar(
        select(Zone.id).where(Zone.farm_id == farm.id, Zone.name == zone_name)) else []
    if not snapshots or snapshots[0].planting is None:
        return None
    today = now.astimezone(ZoneInfo(farm.timezone)).date()
    efficiency = float((await farm_settings(session, farm)).irrigation_efficiency)
    ctx = water_context(snapshots[0], today, efficiency, False)
    return {(t["row"], t["col"]): t for t in advisor.advise_trees(ctx, trees)}


async def bed_growth(session: AsyncSession, zone_name: str, farm_name: str, now: datetime | None = None, days: int = GROWTH_DAYS) -> dict | None:
    """The bed's leaf cover and yellowing round by round, and whether that is what its stage should do."""
    now = now or utcnow()
    zone = await session.scalar(select(Zone).join(Zone.farm).where(Zone.name == zone_name, Zone.farm.has(name=farm_name)))
    if zone is None:
        return None
    planting = await session.scalar(select(Planting).where(Planting.zone_id == zone.id, Planting.ended_on.is_(None)))
    missions = (await session.scalars(select(SurveyMission).where(
        SurveyMission.zone_id == zone.id, SurveyMission.status == "completed", SurveyMission.completed_at >= now - timedelta(days=days))
        .order_by(SurveyMission.completed_at))).all()
    rounds = []
    per_tree: dict[tuple[int, int], list[float]] = {}
    for m in missions:
        found = (await session.scalars(select(SurveyFinding).where(SurveyFinding.mission_id == m.id, SurveyFinding.plant_present.is_(True)))).all()
        canopies = [float(f.canopy) for f in found if f.canopy is not None]
        if not canopies:
            continue
        for f in found:
            if f.canopy is not None:
                per_tree.setdefault((f.cell_row, f.cell_col), []).append(float(f.canopy))
        rounds.append({"at": m.completed_at.isoformat(), "canopy": sum(canopies) / len(canopies), "yellow": sum(f.flagged for f in found) / len(found),
                       "simulated": m.simulated})
    today = now.date()
    day = guava.days_between(planting.planted_on, today) if planting else 1
    stage = guava.stage_of(day)
    return {"zone": zone.name, "label": zone.label or zone.name, "stage": stage.title, "rounds": rounds,
            "summary": advisor.growth(rounds, stage),
            "trees": sorted(({"row": k[0], "col": k[1], "first": round(v[0], 3), "now": round(v[-1], 3)} for k, v in per_tree.items()),
                            key=lambda t: t["now"] - t["first"])[:5]}
