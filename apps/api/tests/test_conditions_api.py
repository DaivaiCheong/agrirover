"""Stored readings, rated against the guava stage of the open cycle; and the advice the rover's rounds lead to."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pgdb
from sqlalchemy import select

from app.core.config import settings
from app.models.entities import OrchardJobDone, Planting, Zone
from app.services.advice import bed_growth, farm_advice
from app.services.clock import farm_today
from app.services.conditions import bed_conditions
from app.services.demo_orchard import backfill_rounds, readings_for
from app.services.rover_live import store_report
from app.services.seed import seed_stage1

FARM = settings.farm_name
NOW = datetime.now(timezone.utc)


async def seeded(Session):
    async with Session() as s:
        await seed_stage1(s)


def report(zone, readings, *, at=None, status="completed", trees=4):
    at = at or NOW - timedelta(minutes=10)
    cells = [{"row": 0, "col": c, "plant": True, "canopy": 0.4, "chlorosis": 0.0, "flagged": False, "readings": dict(readings)} for c in range(trees)]
    return {"missionId": str(uuid.uuid4()), "zoneId": zone, "status": status, "simulated": True, "cellsScanned": trees, "cellsTotal": trees,
            "plantsDetected": trees, "cellsFlagged": 0, "distanceM": 9.0, "estDurationS": 200, "startedAt": (at - timedelta(minutes=5)).isoformat(),
            "finishedAt": at.isoformat(), "grid": {"rows": 1, "cols": trees, "cellM": 3.0, "rowM": 3.0}, "cells": cells}


async def bed(Session, zone):
    async with Session() as s:
        return next(b for b in await bed_conditions(s, FARM) if b["zone"] == zone)


def param(b, metric):
    return next(p for p in b["params"] if p["metric"] == metric)


@pgdb.with_db("aaf_guava_seed")
async def test_the_seed_is_six_guava_beds_at_their_own_stages_and_repeatable(Session):
    await seeded(Session)
    await seeded(Session)
    async with Session() as s:
        zones = (await s.scalars(select(Zone).order_by(Zone.name))).all()
        assert [z.name for z in zones] == ["g1", "g2", "g3", "g4", "g5", "g6"]
        plantings = (await s.scalars(select(Planting))).all()
        assert len(plantings) == 5
        assert all(p.trees_planted_on < p.planted_on for p in plantings)
        # a task whose time has passed is already done, except the one left open to show an overdue task
        g3 = next(p for p in plantings if p.setup == "hedgerow")
        done = set((await s.scalars(select(OrchardJobDone.job_id).where(OrchardJobDone.planting_id == g3.id))).all())
        assert "pinch" in done and "zn_b" not in done
    assert (await bed(Session, "g6"))["stage"] is None


@pgdb.with_db("aaf_guava_round")
async def test_a_round_feeds_the_telemetry_table_and_is_rated_by_stage(Session):
    await seeded(Session)
    async with Session() as s:
        assert await store_report(s, report("g3", {"soil_moisture": 52.0, "soil_ec": 1.9, "soil_ph": 6.3, "nitrogen": 1}))
    b = await bed(Session, "g3")
    assert b["stage"]["key"] == "bloom"
    assert param(b, "soil_moisture")["value"] == 52 and param(b, "soil_moisture")["status"] == "critical"
    assert "bloom_floor" in [a["id"] for a in b["alerts"]] and b["status"] == "critical"
    assert param(b, "nitrogen")["status"] == "unrated"


@pgdb.with_db("aaf_guava_stress")
async def test_dry_soil_is_right_for_a_stressed_bed(Session):
    await seeded(Session)
    async with Session() as s:
        assert await store_report(s, report("g1", {"soil_moisture": 25.0}))
    assert param(await bed(Session, "g1"), "soil_moisture")["status"] == "normal"


@pgdb.with_db("aaf_guava_stale")
async def test_a_round_from_two_days_ago_is_shown_but_not_acted_on(Session):
    await seeded(Session)
    async with Session() as s:
        assert await store_report(s, report("g3", {"soil_moisture": 52.0}, at=NOW - timedelta(hours=48)))
    b = await bed(Session, "g3")
    assert param(b, "soil_moisture")["status"] == "stale" and b["alerts"] == []
    async with Session() as s:
        g3 = next(a for a in await farm_advice(s, FARM) if a["zone"] == "g3")
    assert g3["surveyed"] is False and g3["todo"] == [] and g3["treesSeen"] == 0


@pgdb.with_db("aaf_guava_advice")
async def test_advice_waters_only_the_dry_trees_and_holds_feed_in_salty_soil(Session):
    await seeded(Session)
    r = report("g3", {"soil_moisture": 72.0, "soil_ec": 2.5, "soil_ph": 6.3})
    r["cells"][1]["readings"] = {"soil_moisture": 60.0, "soil_ec": 2.5, "soil_ph": 6.3}
    async with Session() as s:
        assert await store_report(s, r)
    async with Session() as s:
        g3 = next(a for a in await farm_advice(s, FARM) if a["zone"] == "g3")
    assert (g3["surveyed"], g3["simulated"], g3["treesSeen"], g3["treesWatered"]) == (True, True, 4, 1)
    water = g3["water"]
    assert 0 < water["litres"] < water["fullLitres"] and water["savedLitres"] == water["fullLitres"] - water["litres"]
    assert g3["feed"]["action"] == "hold"
    assert any(t["kind"] == "feed" and "Hold" in t["text"] for t in g3["todo"])


@pgdb.with_db("aaf_guava_advice_stress")
async def test_a_stressed_bed_gets_no_water_and_says_why(Session):
    await seeded(Session)
    async with Session() as s:
        assert await store_report(s, report("g1", {"soil_moisture": 25.0}))
    async with Session() as s:
        g1 = next(a for a in await farm_advice(s, FARM) if a["zone"] == "g1")
    assert g1["water"]["paused"] is True and g1["water"]["litres"] == 0
    assert "stress" in g1["todo"][0]["text"]


@pgdb.with_db("aaf_guava_backfill")
async def test_two_weeks_of_simulated_rounds_show_growth_and_are_added_once(Session):
    await seeded(Session)
    async with Session() as s:
        added = await backfill_rounds(s, FARM, NOW)
    assert added == 5 * 14
    async with Session() as s:
        assert await backfill_rounds(s, FARM, NOW) == 0
        grown = await bed_growth(s, "g2", FARM, NOW)             # day 60: in the flush
        shed = await bed_growth(s, "g1", FARM, NOW)              # day 30: under stress
    assert len(grown["rounds"]) == 14 and all(r["simulated"] for r in grown["rounds"])
    assert grown["summary"]["verdict"] == "ok" and grown["summary"]["changePoints"] > 0
    assert shed["summary"]["verdict"] == "ok" and shed["summary"]["changePoints"] < 0


@pgdb.with_db("aaf_guava_events")
async def test_the_scripted_events_raise_the_alert_each_bed_should_show(Session):
    await seeded(Session)
    async with Session() as s:
        await backfill_rounds(s, FARM, NOW)
    want = {"g1": "stress_humidity", "g2": "low_ec", "g3": "bloom_floor", "g4": "bag_now", "g5": "cracking"}
    for zone, alert in want.items():
        assert alert in [a["id"] for a in (await bed(Session, zone))["alerts"]], zone


@pgdb.with_db("aaf_guava_cycle")
async def test_the_cycle_page_and_its_tasks_through_the_api(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        cycles = (await c.get("/api/v1/cycles")).json()
        g4 = next(x for x in cycles if x["zone"] == "g4")
        assert g4["grid"] == {"rows": 5, "cols": 5, "rowM": 2, "treeM": 1} and g4["perennial"]["regulation"] == "pruning"
        view = (await c.get(f"/api/v1/cycles/{g4['id']}/orchard")).json()
        assert view["day"] == 120 and view["stage"]["key"] == "bulking" and view["fruitMm"] == 34
        assert next(j for j in view["jobs"] if j["id"] == "bag")["state"] == "due"
        done = (await c.post(f"/api/v1/cycles/{g4['id']}/orchard/jobs/bag/done")).json()
        assert done["bagged"] is True and next(j for j in done["jobs"] if j["id"] == "bag")["state"] == "done"
        assert (await c.post(f"/api/v1/cycles/{g4['id']}/orchard/jobs/nope/done")).status_code == 422
        undone = (await c.delete(f"/api/v1/cycles/{g4['id']}/orchard/jobs/bag/done")).json()
        assert undone["bagged"] is False and next(j for j in undone["jobs"] if j["id"] == "bag")["state"] == "due"
        again = await c.delete(f"/api/v1/cycles/{g4['id']}/orchard/jobs/bag/done")      # undoing twice is harmless
        assert again.status_code == 200 and next(j for j in again.json()["jobs"] if j["id"] == "bag")["state"] == "due"
        assert (await c.delete(f"/api/v1/cycles/{g4['id']}/orchard/jobs/nope/done")).status_code == 422
        assert (await c.post(f"/api/v1/cycles/{g4['id']}/orchard/fruit", json={"mm": 38})).json()["fruitMm"] == 38
        assert (await c.post(f"/api/v1/cycles/{g4['id']}/orchard/fruit", json={"mm": 0})).status_code == 422
        crops = (await c.get("/api/v1/crops")).json()
        assert [x["slug"] for x in crops] == ["guava"]
        assert len((await c.get("/api/v1/setups")).json()) == 4
        started = await c.post("/api/v1/cycles", json={"zone": "g6", "plantedOn": "2026-10-01", "plantCount": 25, "setup": "meadow", "regulation": "bending"})
        assert started.status_code == 201 and started.json()["perennial"]["regulationLabel"] == "Branch bending"
        assert (await c.post("/api/v1/cycles", json={"zone": "g6", "plantedOn": "2026-10-01"})).status_code == 409
        assert (await c.post("/api/v1/cycles", json={"zone": "g6", "plantedOn": "2026-10-01", "setup": "nope"})).status_code == 422


def test_a_cycle_day_gives_readings_inside_its_stage_unless_an_event_says_otherwise():
    assert 60 <= readings_for(50, False)["soil_moisture"] <= 70
    assert readings_for(90, False)["soil_moisture"] == 52
    assert readings_for(30, True)["soil_moisture"] <= 30


def test_today_is_cambodia_not_the_server():
    assert isinstance(farm_today(), date)


@pgdb.with_db("aaf_tree_check")
async def test_one_tree_is_read_against_its_own_soil_for_a_photo(Session):
    # the rover's camera is not built: a person photographs a tree, and the answer uses that tree's probe readings
    from app.services.tree_check import tree_context
    await seeded(Session)
    async with Session() as s:
        assert await store_report(s, report("g2", {"soil_moisture": 65.0, "soil_ec": 0.6, "soil_ph": 6.4}))
    async with Session() as s:
        t = await tree_context(s, FARM, "g2", 0, 2)
        assert t["found"] and t["name"] == "R1 T3" and t["simulated"] is True
        ec = next(r for r in t["readings"] if r["metric"] == "soil_ec")
        assert ec["value"] == 0.6 and ec["state"] == "low" and ec["low"] == 1.2
        assert t["soil"]["cause"] == "low_feed"                                   # low EC at flush: feed, not a germ
        missing = await tree_context(s, FARM, "g2", 3, 3)                         # the round only had row 1
        assert missing["found"] is False and missing["readings"] == [] and missing["name"] == "R4 T4"
        assert (await tree_context(s, FARM, "g6", 0, 0))["stage"] is None        # nothing growing: no stage, no rule
    async with pgdb.api(Session) as c:
        assert (await c.get("/api/v1/photos/tree", params={"zone": "g2", "row": 0, "col": 2})).json()["soil"]["cause"] == "low_feed"
        assert (await c.get("/api/v1/photos/tree", params={"zone": "g2", "row": -1, "col": 0})).status_code == 422
        assert (await c.get("/api/v1/photos/tree", params={"zone": "nope", "row": 0, "col": 0})).status_code == 404
