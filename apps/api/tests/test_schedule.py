"""The plan by date: water, feed, tasks and stage changes."""
from datetime import date, timedelta

import pgdb
import pytest

from app.services import guava
from app.services.seed import seed_stage1
from app.services.schedule import events_for, farm_schedule, water_day

START = date(2026, 11, 5)
B = guava.SETUP_BY_ID["commercial"]


def events(day, days=14, done=frozenset(), regulation="pruning"):
    return events_for(START, days, zone="g2", label="G2", planted_on=START - timedelta(days=day - 1), today_day=day, done=set(done), regulation=regulation, setup=B, trees=10)


def kinds(items, kind):
    return [e for e in items if e["kind"] == kind]


def drip_feeds(items):
    return [e for e in items if e["title"].startswith("Feed:")]


class TestWater:
    def args(self, **over):
        return {"trees": 10, "area_per_tree": 10.5, "efficiency": 0.9, "stress": False, **over}

    def test_stress_holds_the_water(self):
        cell = water_day(START, 30, **self.args(stress=True))
        assert cell["litres"] == 0 and cell["kind"] == "hold" and cell["stage"] == "Stress"

    def test_a_planned_day_is_the_full_demand_for_every_tree(self):
        cell = water_day(START, 90, **self.args())
        bloom = guava.stage_of(90)
        from app.services import advisor, climate
        assert cell["kind"] == "planned" and cell["litres"] == round(advisor.full_demand_litres(bloom, climate.et0_on(START), 10.5, 0.9, False) * 10)

    def test_priming_days_are_marked(self):
        assert water_day(START, 46, **self.args(stress=True))["kind"] == "priming" and water_day(START, 49, **self.args(stress=True))["kind"] == "priming"

    @pytest.mark.parametrize("day", [0, -3, 181])
    def test_nothing_is_planned_outside_the_cycle(self, day):
        assert water_day(START, day, **self.args()) is None


class TestEvents:
    def test_feed_falls_every_10_days_with_the_dose_and_its_tanks(self):
        feeds = drip_feeds(events(76, days=30))
        assert [f["firstDay"] for f in feeds] == [76, 86, 96]
        assert feeds[0]["title"].startswith("Feed: N ") and "Tank A" in feeds[0]["detail"] and "High EC" in feeds[0]["detail"]

    def test_no_drip_feed_is_planned_during_stress_but_the_basal_feed_is(self):
        items = events(1, days=44)
        assert drip_feeds(items) == [] and [e["title"] for e in kinds(items, "feed")] == ["Basal feed, 15 days before re-watering"]

    def test_a_stage_change_is_dated(self):
        stage = kinds(events(70, days=10), "stage")
        assert [(e["firstDay"], e["title"]) for e in stage] == [(76, "Stage starts: Flowering and fruit set")]
        assert stage[0]["date"] == (START + timedelta(days=6)).isoformat()

    def test_the_cycles_end_is_on_the_plan(self):
        assert any(e["title"] == "Cycle ends" for e in events(170, days=20)) and not any(e["title"] == "Cycle ends" for e in events(100))

    def test_a_task_shows_its_window_and_a_done_one_goes(self):
        pinch = next(e for e in events(60) if e["title"] == "Pinch new shoots")
        assert (pinch["firstDay"], pinch["lastDay"], pinch["state"]) == (60, 72, "due")
        assert not any(e["title"] == "Pinch new shoots" for e in events(60, done={"pinch"}))

    def test_a_late_task_stays_on_the_plan_however_old(self):
        zinc = next(e for e in events(90) if e["title"] == "Foliar zinc and boron")
        assert zinc["state"] == "overdue" and zinc["kind"] == "foliar" and zinc["confirm"]

    def test_a_task_beyond_the_range_is_left_for_later(self):
        assert not any(e["title"] == "Stop nitrogen" for e in events(60, days=14))
        assert any(e["title"] == "Stop nitrogen" for e in events(60, days=90))


@pgdb.with_db("aaf_schedule")
async def test_the_whole_farm_is_on_the_plan_by_date(Session):
    async with Session() as s:
        await seed_stage1(s)
    async with Session() as s:
        plan = await farm_schedule(s, 14)
    assert plan["roundTime"] == "07:00" and len(plan["dates"]) == 14
    assert [b["zone"] for b in plan["blocks"]] == ["g1", "g2", "g3", "g4", "g5"]                # g6 grows nothing
    g1 = plan["blocks"][0]
    assert len(g1["water"]) == 14 and all(c["kind"] == "hold" for c in g1["water"] if c and c["day"] <= 45)
    assert [e["date"] for e in plan["events"]] == sorted(e["date"] for e in plan["events"])
    assert drip_feeds(plan["events"])

    async with pgdb.api(Session) as c:
        assert (await c.get("/api/v1/schedule?days=7")).json()["days"] == 7
        assert (await c.get("/api/v1/schedule?days=999")).status_code == 422
