"""Leaf samples and lab results: kept in the lab's own units, and low or high only when both studies agree."""
from datetime import timedelta

import pgdb
import pytest

from app.services import guava
from app.services.clock import farm_today
from app.services.seed import seed_stage1

URL = "/api/v1/leaf-tests"


def seeded(db_name):
    def wrap(fn):
        @pgdb.with_db(db_name)
        async def body(Session):
            async with Session() as s:
                await seed_stage1(s)
            async with pgdb.api(Session) as c:
                await fn(c)
        body.__name__ = fn.__name__
        return body
    return wrap


async def sample(c, zone="g1", days_ago=0, **more):
    r = await c.post(URL, json={"zone": zone, "takenOn": (farm_today() - timedelta(days=days_ago)).isoformat(), "leafPairs": 12, **more})
    assert r.status_code == 201, r.text
    return r.json()


async def results(c, sample_id, values, lab="A lab", **more):
    return await c.put(f"{URL}/{sample_id}/results", json={"lab": lab, "values": [{"nutrient": n, "value": v, "unit": u} for n, v, u in values], **more})


class TestRanges:
    def test_a_range_is_both_studies_together(self):
        assert guava.LEAF_BY_CODE["p"].range == (1.0, 1.7)
        assert guava.LEAF_BY_CODE["b"].range == (13.1, 38)

    def test_inside_one_study_only_is_not_called_a_shortage(self):
        assert guava.rate_leaf("p", 1.2, "g/kg") == "ok"       # below Souza, inside the 2020 study

    @pytest.mark.parametrize("code,value,unit,status", [
        ("n", 17.8, "g/kg", "low"), ("n", 17.9, "g/kg", "ok"), ("n", 21.2, "g/kg", "ok"), ("n", 21.3, "g/kg", "high"),
        ("n", 1.9, "%", "ok"), ("k", 1.2, "%", "low"),
        ("zn", 12, "mg/kg", "low"), ("zn", 12, "ppm", "low"), ("zn", 130, "ppm", "high"),
        ("n", 1.9, "g/kg", "check"),                           # a percentage typed as g/kg
        ("n", 190, "g/kg", "check"), ("n", 0, "g/kg", "check"),
        ("al", 400, "mg/kg", "none"),
    ])
    def test_rating(self, code, value, unit, status):
        assert guava.rate_leaf(code, value, unit) == status

    def test_a_major_nutrient_converts_from_percent_and_a_trace_one_from_g_per_kg(self):
        assert guava.leaf_in_base("n", 1.9, "%") == pytest.approx(19)
        assert guava.leaf_in_base("zn", 0.05, "g/kg") == pytest.approx(50)

    def test_the_cycle_tab_shows_the_same_ranges_as_the_rating(self):
        assert {"nutrient": "Phosphorus (P)", "range": "1-1.7 g/kg"} in guava.LEAF_RANGES
        assert not any("Aluminium" in r["nutrient"] for r in guava.LEAF_RANGES)

    def test_the_sample_task_falls_in_flowering_after_the_zinc_spray(self):
        job = next(j for j in guava.JOBS if j.id == "leaf_test")
        spray = next(j for j in guava.JOBS if j.id == "zn_b")
        assert guava.stage_of(job.first_day).n == guava.stage_of(job.last_day).n == 3
        assert job.first_day > spray.last_day


@seeded("aaf_leaf_empty")
async def test_an_empty_farm_lists_no_samples_and_offers_its_blocks(c):
    r = (await c.get(URL)).json()
    assert (r["total"], r["waiting"], r["withResults"], r["outOfRange"], r["samples"], r["compare"]) == (0, 0, 0, 0, [], [])
    assert "g1" in [b["zone"] for b in r["blocks"]]
    assert [n["code"] for n in r["nutrients"]][:3] == ["n", "p", "k"]


@seeded("aaf_leaf_sample")
async def test_a_sample_works_out_its_crop_day_and_waits_for_its_lab(c):
    s = await sample(c, row=1, col=2, collectedBy=" Sokha ", note=" ")
    assert (s["zone"], s["tree"], s["leafPairs"], s["collectedBy"], s["note"]) == ("g1", "R2 T3", 12, "Sokha", None)
    assert s["cropDay"] == 30 and s["stage"] == "Stress" and s["atBloom"] is False
    assert s["results"] == [] and s["lab"] is None
    r = (await c.get(URL)).json()
    assert (r["total"], r["waiting"], r["withResults"]) == (1, 1, 0)


@seeded("aaf_leaf_refuse")
async def test_it_refuses_what_cannot_be_true(c):
    today = farm_today()
    post = lambda **b: c.post(URL, json={"zone": "g1", "takenOn": today.isoformat(), "leafPairs": 12, **b})
    assert (await post(takenOn=(today + timedelta(days=1)).isoformat())).status_code == 422
    assert (await post(takenOn=(today - timedelta(days=4000)).isoformat())).status_code == 422       # no crop growing then
    assert (await post(row=1)).status_code == 422
    assert (await post(leafPairs=0)).status_code == 422
    assert (await post(zone="nowhere")).status_code == 404

    s = await sample(c, days_ago=2)
    assert (await results(c, s["id"], [("n", 19, "g/kg")], lab=" ")).status_code == 422
    assert (await results(c, s["id"], [("xx", 19, "g/kg")])).status_code == 422
    assert (await results(c, s["id"], [("n", 19, "stone")])).status_code == 422
    assert (await results(c, s["id"], [("n", 19, "g/kg"), ("n", 20, "g/kg")])).status_code == 422
    assert (await results(c, s["id"], [("n", -1, "g/kg")])).status_code == 422
    assert (await results(c, s["id"], [("n", 19, "g/kg")], resultsOn=(today - timedelta(days=3)).isoformat())).status_code == 422
    assert (await results(c, s["id"], [("n", 19, "g/kg")], resultsOn=(today + timedelta(days=1)).isoformat())).status_code == 422
    assert (await c.get(URL)).json()["samples"][0]["results"] == []


@seeded("aaf_leaf_results")
async def test_results_keep_the_labs_unit_and_are_rated_in_the_ranges_unit(c):
    s = await sample(c)
    r = await results(c, s["id"], [("k", 1.2, "%"), ("n", 1.9, "%"), ("zn", 130, "ppm"), ("al", 400, "mg/kg")], lab=" Soil lab ")
    assert r.status_code == 200
    out = r.json()
    assert out["lab"] == "Soil lab" and out["resultsOn"] == farm_today().isoformat()
    assert [x["nutrient"] for x in out["results"]] == ["n", "k", "zn", "al"]          # the order of the list of nutrients
    k = out["results"][1]
    assert (k["value"], k["unit"], k["inBase"], k["base"], k["status"]) == (1.2, "%", 12, "g/kg", "low")
    assert (out["low"], out["high"], out["check"]) == (["K"], ["Zn"], [])
    listed = (await c.get(URL)).json()
    assert (listed["waiting"], listed["withResults"], listed["outOfRange"]) == (0, 1, 1)


@seeded("aaf_leaf_replace")
async def test_saving_again_replaces_and_saving_nothing_clears(c):
    s = await sample(c)
    await results(c, s["id"], [("n", 19, "g/kg"), ("p", 1.2, "g/kg")])
    out = (await results(c, s["id"], [("n", 16, "g/kg")])).json()
    assert [(x["nutrient"], x["value"]) for x in out["results"]] == [("n", 16)]
    out = (await results(c, s["id"], [], lab=None)).json()
    assert out["results"] == [] and out["lab"] is None and out["resultsOn"] is None
    assert (await c.get(URL)).json()["waiting"] == 1


@seeded("aaf_leaf_compare")
async def test_the_comparison_takes_each_blocks_newest_whole_block_result(c):
    old = await sample(c, days_ago=9)
    new = await sample(c, days_ago=2)
    tree = await sample(c, days_ago=1, row=0, col=0)
    waiting = await sample(c)
    other = await sample(c, zone="g2", days_ago=3)
    await results(c, old["id"], [("n", 10, "g/kg")])
    await results(c, new["id"], [("n", 19, "g/kg")])
    await results(c, tree["id"], [("n", 25, "g/kg")])
    await results(c, other["id"], [("n", 17, "g/kg")])
    rows = (await c.get(URL)).json()["compare"]
    assert {x["zone"]: x["values"]["n"] for x in rows} == {"g1": {"inBase": 19, "status": "ok"}, "g2": {"inBase": 17, "status": "low"}}
    assert waiting["results"] == []


@seeded("aaf_leaf_delete")
async def test_deleting_a_sample_takes_its_results(c):
    s = await sample(c)
    await results(c, s["id"], [("n", 19, "g/kg")])
    assert (await c.delete(f"{URL}/{s['id']}")).status_code == 204
    assert (await c.get(URL)).json()["total"] == 0
    assert (await c.delete(f"{URL}/{s['id']}")).status_code == 404
    assert (await results(c, s["id"], [("n", 19, "g/kg")])).status_code == 404
