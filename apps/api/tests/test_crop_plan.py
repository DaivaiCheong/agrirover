"""The crop plan: how many plants and when -> water by season, feed, tasks, harvest.

Hand calculations used below (tomato, 100 plants, 50 x 70 cm = 0.35 m2 each, efficiency 0.9,
planted 15 November 2026, so the crop ends 29 March 2027):
  day 1  (15 Nov, ET0 3.83, Kc 0.60): 0.6 x 3.83 x 0.35 / 0.9 = 0.8937 L per plant  -> 89.4 L for 100
  day 80 (2 Feb,  ET0 5.12, Kc 1.15): 1.15 x 5.12 x 0.35 / 0.9 = 2.2898 L per plant -> 229.0 L for 100
  feed: N 75 kg/ha = 7.5 g/m2 x 0.35 = 2.625 g per plant; compost 20 t/ha = 2 kg/m2 x 0.35 = 0.7 kg per plant"""
from datetime import date

import pgdb
import pytest

from app.services import crop_guide as cg
from app.services import water_plan as wp
from app.services.seed import seed_stage1

V1 = "/api/v1"
PLANTED = date(2026, 11, 15)


def plan(plants=100, planted=PLANTED, today=PLANTED, **kw):
    return cg.build_plan(crop=wp.TOMATO, guide=cg.TOMATO, plants=plants, planted_on=planted, today=today, **kw)


# ------------------------------------------------------------------ the numbers

def test_water_for_a_day_is_worked_out_from_the_season():
    assert plan()["now"]["litersToday"] == pytest.approx(89.4, abs=0.05)
    assert plan()["now"]["litersPerPlant"] == pytest.approx(0.89, abs=0.005)
    day80 = plan(today=date(2027, 2, 2))["now"]
    assert day80["day"] == 80 and day80["stage"] == "mid-season"
    assert day80["litersToday"] == pytest.approx(229.0, abs=0.05)
    assert day80["ifCloudy"] == pytest.approx(229.0 * 2 / 3, abs=0.1)        # Hiroshima: two-thirds on a cloudy day
    assert day80["ifRainy"] == pytest.approx(229.0 / 3, abs=0.1)             # one-third on a rainy day


def test_planting_month_changes_the_water():
    nov, mar = plan(planted=date(2026, 11, 15)), plan(planted=date(2027, 3, 1))
    assert mar["water"]["grossM3"] > nov["water"]["grossM3"]                 # March is hotter and drier than November
    assert nov["water"]["avgEt0MmDay"] < mar["water"]["avgEt0MmDay"]


def test_space_and_spacing():
    p = plan()
    assert p["areaPerPlantM2"] == 0.35 and p["areaM2"] == 35.0 and p["cycleDays"] == 135
    assert p["endsOn"] == "2027-03-29"
    wide = plan(spacing_cm=(100, 50))                                         # 0.5 m2 per plant
    assert wide["areaPerPlantM2"] == 0.5 and wide["water"]["grossM3"] > p["water"]["grossM3"]
    assert plan(area_per_plant_m2=0.4)["areaPerPlantM2"] == 0.4              # a running cycle uses its own area


def test_the_plan_is_checked_against_the_japanese_peak():
    chk = plan()["water"]["check"]
    assert chk["ourPeakMmDay"] == pytest.approx(6.14, abs=0.01)              # Kc 1.15 x March ET0 5.34
    assert chk["japanMmDayRange"] == [4.5, 6.1]                              # Aomori 2.2-3.0 L / 0.49 m2 per plant
    assert chk["verdict"] == "close"                                         # 0.02 above the range: said, not hidden
    cool = plan(planted=date(2026, 8, 1))["water"]["check"]                  # peak falls in Oct-Nov, ET0 only 3.65-3.83
    assert cool["ourPeakMmDay"] == pytest.approx(4.40, abs=0.01) and cool["verdict"] == "close"
    assert plan(planted=date(2026, 10, 15))["water"]["check"]["verdict"] in ("inside", "close")
    assert cg.build_plan(crop=wp.CropWater("x", "X", 0.3, 0.4, 0.3, (10, 10, 10, 10), ""), guide=None, plants=10,
                         planted_on=PLANTED, today=PLANTED)["water"]["check"]["verdict"] == "outside"


def test_feed_scales_with_area_and_follows_the_split():
    f = plan()["feed"]
    first, second, third = f["rows"]
    assert first["when"] == "At planting" and first["compostKg"] == 0.7
    assert first["nitrogenG"] == pytest.approx(1.31, abs=0.01) and second["nitrogenG"] == pytest.approx(0.66, abs=0.01)
    assert first["phosphateG"] == pytest.approx(1.05, abs=0.01) and first["potashG"] == pytest.approx(3.5, abs=0.01)
    assert first["nitrogenG"] + second["nitrogenG"] + third["nitrogenG"] == pytest.approx(2.625, abs=0.02)
    assert f["totalsForAllPlants"]["compostKg"] == 70.0 and f["totalsForAllPlants"]["mulchKg"] == 35.0
    assert f["totalsForAllPlants"]["ureaKg"] == pytest.approx(0.57, abs=0.01)    # 2.625 g / 0.46 x 100 plants
    assert plan(spacing_cm=(100, 70))["feed"]["rows"][0]["compostKg"] == 1.4     # twice the area, twice the compost


def test_harvest_window_and_the_japanese_benchmark():
    h = plan()["harvest"]
    assert h["firstPickDay"] == 49 and h["firstPickOn"] == "2027-01-02" and h["lastOn"] == "2027-03-29"
    rows = {r["label"]: r for r in h["benchmark"]["rows"]}
    assert rows["Regional average"]["kgPerPlant"] == pytest.approx(5.4, abs=0.05)    # 11 t / 2,040 plants
    assert rows["The best grower (2021)"]["kgPerPlant"] == pytest.approx(8.8, abs=0.05)
    assert rows["Regional average"]["kgForYourPlants"] == pytest.approx(539, abs=1)
    assert "ceiling" in h["benchmark"]["caution"] and "Cambodia" in h["benchmark"]["caution"]


# ------------------------------------------------------------- what is happening today

def test_today_before_during_and_after_the_crop():
    assert plan(today=date(2026, 11, 10))["now"] == {"state": "not_planted", "startsInDays": 5}
    assert plan(today=date(2027, 4, 2))["now"] == {"state": "finished", "daysAgo": 4}
    day1 = plan()["now"]
    assert day1["day"] == 1 and day1["stageTitle"] == "Settling in" and day1["daysLeft"] == 134
    assert len(day1["tasks"]) == 3                                              # water in, mulch, first feed
    assert day1["next"]["inDays"] == 13 and "stakes" in day1["next"]["text"]
    assert plan(today=date(2027, 3, 29))["now"]["next"] is None                 # nothing after the last day


# --------------------------------------------------------------- the season

def test_heat_warning_depends_on_how_much_of_the_crop_falls_in_march_to_june():
    nov = plan(planted=date(2026, 11, 15))["season"]                             # 29 hot days of 135: a note
    assert nov["hotDays"] == 29 and [n["kind"] for n in nov["notes"]] == ["note"]
    dec = plan(planted=date(2026, 12, 15))["season"]                             # 59 hot days: a warning
    assert dec["hotDays"] == 59 and dec["notes"][0]["kind"] == "warn" and "KK1" in dec["notes"][0]["text"]
    cool = plan(planted=date(2026, 10, 1))["season"]                             # ends 13 Feb: no heat note
    assert cool["hotDays"] == 0 and all("March-June" not in n["text"] for n in cool["notes"])


def test_every_statement_names_where_it_comes_from():
    p = plan()
    keys = {s["key"] for s in p["sources"]}
    assert {"aomori", "rua", "nasa", "fukushima", "hiroshima", "kumamoto", "yamaguchi", "fao56"} <= keys
    assert all(s["read"] and s["url"].startswith("https://") for s in p["sources"])
    basis = [h["basis"] for h in p["water"]["howTo"]] + [t["basis"] for t in p["tasks"]] + [p["feed"]["basis"]]
    for b in basis:
        assert b == "practice" or b.split(":", 1)[1] in keys                    # no source that is not listed
    hiroshima = next(s for s in p["sources"] if s["key"] == "hiroshima")
    assert "partly read" in hiroshima["read"]                                    # the one we could not fully read


def test_stage_cards_cover_the_whole_cycle():
    p = plan()
    assert [(s["firstDay"], s["lastDay"]) for s in p["stages"]] == [(1, 30), (31, 70), (71, 110), (111, 135)]
    assert sum(s["grossM3"] for s in p["stages"]) == pytest.approx(p["water"]["grossM3"], abs=0.03)
    assert len(p["water"]["days"]) == 135 and len(p["water"]["weeks"]) == 20


def test_default_area_and_the_stage_name_of_a_day():
    assert cg.default_area_per_plant_m2("tomato") == 0.35                  # 50 x 70 cm, the Cambodian trial
    assert cg.default_area_per_plant_m2("chilli-pepper") == 0.5            # no guide: 50 x 100 cm
    # day 22 is still "Settling in" by the FAO stages (1-30). First flowers come about day 28-42, so the app does
    # not call day 22 "early flowering".
    assert cg.stage_of(wp.TOMATO, 22) == ("initial", "Settling in")
    assert cg.stage_of(wp.TOMATO, 75) == ("mid-season", "Heavy picking")
    assert cg.stage_of(wp.TOMATO, 0) is None and cg.stage_of(wp.TOMATO, 136) is None and cg.stage_of(wp.TOMATO, None) is None
    chilli = wp.CropWater("chilli-pepper", "Chilli", 0.6, 1.05, 0.9, (20, 30, 40, 20), "")
    assert cg.stage_of(chilli, 25) == ("development", "Development")      # no guide: the plain stage name


def test_the_pf_target_is_also_given_in_kpa():
    text = plan()["water"]["howTo"][2]["text"]
    assert "6-25 kPa" in text
    assert 10 ** 1.8 * 0.0980665 == pytest.approx(6.2, abs=0.05) and 10 ** 2.4 * 0.0980665 == pytest.approx(24.6, abs=0.05)


# ------------------------------------------------------------------ through the API

async def seeded(Session):
    async with Session() as s:
        await seed_stage1(s, planted_on=date(2026, 10, 14))


@pgdb.with_db("aaf_plan_api")
async def test_crop_plan_endpoint(Session):
    await seeded(Session)
    q = {"plants": 100, "plantedOn": "2026-11-15", "today": "2026-11-15"}
    async with pgdb.api(Session) as c:
        r = await c.get(f"{V1}/crop-plan", params=q)
        assert r.status_code == 200
        b = r.json()
        assert b["hasGuide"] is True and b["now"]["litersToday"] == pytest.approx(89.4, abs=0.05)
        assert b["water"]["efficiency"] == 0.9 and b["areaM2"] == 35.0

        drip = (await c.get(f"{V1}/crop-plan", params={**q, "efficiency": 0.6})).json()       # hand watering
        assert drip["water"]["grossM3"] > b["water"]["grossM3"]
        assert (await c.get(f"{V1}/crop-plan", params={**q, "rowCm": 100, "plantCm": 50})).json()["areaPerPlantM2"] == 0.5

        for bad in ({"plants": 0}, {"plants": 2_000_000}, {"efficiency": 1.5}, {"plantedOn": "nonsense"},
                    {"crop": "unobtainium"}, {"rowCm": 5, "plantCm": 50}):
            assert (await c.get(f"{V1}/crop-plan", params={**q, **bad})).status_code == 422
        assert (await c.get(f"{V1}/crop-plan", params={"plantedOn": "2026-11-15"})).status_code == 422   # plants missing


@pgdb.with_db("aaf_plan_cycle")
async def test_plan_for_a_running_cycle_uses_its_own_numbers(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        cycle = next(x for x in (await c.get(f"{V1}/cycles")).json() if x["zone"] == "zone-a")
        r = await c.get(f"{V1}/cycles/{cycle['id']}/plan", params={"today": "2026-11-04"})
        assert r.status_code == 422 and "how many plants" in r.json()["detail"]      # nothing guessed

        await c.patch(f"{V1}/cycles/{cycle['id']}", json={"plantCount": 80, "areaM2": 40})
        b = (await c.get(f"{V1}/cycles/{cycle['id']}/plan", params={"today": "2026-11-04"})).json()
        assert b["plants"] == 80 and b["areaPerPlantM2"] == 0.5 and b["now"]["day"] == 22   # planted 14 Oct: day 1
        assert b["now"]["litersToday"] == pytest.approx(80 * 0.6 * 3.83 * 0.5 / 0.9, abs=0.1)  # November ET0 3.83
        assert b["plantedOn"] == cycle["plantedOn"]
        assert (await c.get(f"{V1}/cycles/00000000-0000-0000-0000-000000000000/plan")).status_code == 404


@pgdb.with_db("aaf_plan_stage")
async def test_cycles_and_crops_carry_the_stage_and_the_default_area(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        tomato = next(x for x in (await c.get(f"{V1}/crops")).json() if x["slug"] == "tomato")
        assert tomato["defaultAreaPerPlantM2"] == 0.35

        rows = (await c.get(f"{V1}/cycles", params={"today": "2026-11-04"})).json()
        a = next(x for x in rows if x["zone"] == "zone-a")
        assert a["day"] == 22 and a["stage"] == "initial" and a["stageTitle"] == "Settling in"

        bed = (await c.post(f"{V1}/zones", json={"label": "Later bed"})).json()
        later = (await c.post(f"{V1}/cycles", json={"zone": bed["name"], "crop": "tomato", "plantedOn": "2026-12-01"})).json()
        rows = (await c.get(f"{V1}/cycles", params={"today": "2026-11-04"})).json()
        row = next(x for x in rows if x["id"] == later["id"])
        assert row["day"] < 1 and row["stage"] is None and row["stageTitle"] is None   # not planted yet: no stage

        await c.post(f"{V1}/cycles/{a['id']}/close", json={"endedOn": "2026-11-04"})
        rows = (await c.get(f"{V1}/cycles", params={"today": "2026-11-05"})).json()
        done = next(x for x in rows if x["id"] == a["id"])
        assert done["status"] == "closed" and done["stage"] is None
