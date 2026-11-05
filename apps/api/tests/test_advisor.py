"""The day's advice: as little water as the stage allows, and feed that cannot burn the trees."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import advisor, guava
from app.services.advisor import WaterContext, advise_feed, advise_trees, feed_due, feed_dose, full_demand_litres, tree_litres, water_share
from app.services.guava import STAGES, SETUP_BY_ID, Reading

FLUSH, BLOOM, BULK, RIPE, STRESS = STAGES[1], STAGES[2], STAGES[3], STAGES[4], STAGES[0]
B = SETUP_BY_ID["commercial"]


def ctx(stage=BLOOM, stress=False, raining=False, et0=4.0, area=10.0):
    return WaterContext(stage=stage, stress=stress, et0=et0, area_per_tree=area, efficiency=0.9, raining=raining)


def tree(col=0, moisture=None, **more):
    readings = {} if moisture is None else {"soil_moisture": moisture}
    readings.update(more.pop("readings", {}))
    return {"row": 0, "col": col, "plant": True, "canopy": more.pop("canopy", 0.4), "flagged": more.pop("flagged", False), "readings": readings}


class TestWater:
    def test_full_demand_is_et0_kc_share_area_over_efficiency(self):
        assert full_demand_litres(BLOOM, 4.0, 10.0, 0.9, False) == pytest.approx(4.0 * 0.93 * 1.0 * 10 / 0.9)
        assert full_demand_litres(RIPE, 4.0, 10.0, 0.9, False) == pytest.approx(4.0 * 1.1 * 0.7 * 10 / 0.9)    # ripening tapers to 60-80 %

    def test_stress_uses_no_water_but_stage_one_without_stress_waters_like_the_flush(self):
        assert full_demand_litres(STRESS, 4.0, 10.0, 0.9, True) == 0
        assert full_demand_litres(STRESS, 4.0, 10.0, 0.9, False) == pytest.approx(full_demand_litres(FLUSH, 4.0, 10.0, 0.9, False))

    @pytest.mark.parametrize("moisture,share", [(75, 0), (70, 0), (68, 0.4), (66.5, 0.7), (65, 1), (52, 1)])
    def test_the_upper_half_of_the_target_gets_nothing_and_it_rises_to_full_at_the_bottom(self, moisture, share):
        # bloom target is 65-75, so the middle is 70
        assert water_share(moisture, BLOOM, False) == pytest.approx(share, abs=1e-9)

    def test_it_never_gives_more_than_full_demand_however_dry_the_soil(self):
        # sudden water after a dry spell splits fruit
        litres, full = tree_litres(ctx(), {"soil_moisture": 5})
        assert litres == pytest.approx(full)

    def test_a_tree_with_no_reading_gets_full_demand_not_nothing(self):
        litres, full = tree_litres(ctx(), {})
        assert litres == pytest.approx(full) and litres > 0

    def test_rain_means_no_water_today(self):
        assert tree_litres(ctx(raining=True), {"soil_moisture": 40})[0] == 0

    def test_hot_air_asks_for_more_and_humid_air_for_less(self):
        dry = {"soil_moisture": 60}
        base = tree_litres(ctx(), dry)[0]
        assert tree_litres(ctx(), {**dry, "air_temperature": 33})[0] == pytest.approx(base * 1.1)
        assert tree_litres(ctx(), {**dry, "air_humidity": 90})[0] == pytest.approx(base * 0.9)

    def test_stress_soil_stays_dry_on_purpose(self):
        assert tree_litres(ctx(STRESS, stress=True), {"soil_moisture": 18})[0] == 0

    def test_the_stress_band_is_not_used_after_a_pruned_start(self):
        low, high = guava.moisture_band(STRESS, False)
        assert (low, high) == guava.GENERAL_MOISTURE

    def test_only_the_dry_end_of_a_row_is_watered(self):
        rows = advise_trees(ctx(), [tree(0, 72), tree(1, 69), tree(2, 60)])
        assert [r["litres"] > 0 for r in rows] == [False, True, True]
        assert rows[0]["litres"] == 0 and rows[2]["litres"] > rows[1]["litres"]
        assert rows[2]["notes"] == ["Dry"]

    def test_a_cell_with_no_tree_gets_nothing_and_says_so(self):
        rows = advise_trees(ctx(), [{"row": 0, "col": 0, "plant": False, "canopy": 0, "readings": {}}])
        assert rows[0]["litres"] == 0 and rows[0]["notes"] == ["No tree seen"]


class TestFeed:
    def test_every_10_days_from_the_start_of_the_stage(self):
        assert feed_due(BLOOM, 76) == (True, 76)
        assert feed_due(BLOOM, 86) == (True, 86)
        assert feed_due(BLOOM, 80) == (False, 86)

    def test_after_the_last_run_it_waits_for_the_next_stage(self):
        assert feed_due(BLOOM, 104) == (False, 106)

    def test_no_drip_feed_during_stress(self):
        out = advise_feed(STRESS, 30, B, 10, 1.0, 6.3)
        assert out["action"] == "none" and out["dose"] is None

    def test_the_dose_is_the_year_times_the_stage_share_over_its_runs(self):
        dose = feed_dose(FLUSH, B, 10)
        assert dose["runs"] == 3
        assert dose["perTree"]["n"] == pytest.approx(108 * 0.5 / 3, abs=0.05)
        assert dose["total"]["n"] == round(dose["perTree"]["n"] * 10)

    def test_stage_shares_add_up_to_the_whole_year(self):
        for nutrient in range(3):
            assert sum(s[nutrient] for s in advisor.FEED_SHARE.values()) == pytest.approx(1.0)

    def test_no_nitrogen_while_ripening(self):
        assert feed_dose(RIPE, B, 10)["perTree"]["n"] == 0
        assert feed_dose(RIPE, B, 10)["perTree"]["k"] > 0

    def test_a_feed_that_is_due_goes_ahead_in_the_target(self):
        out = advise_feed(BLOOM, 76, B, 10, 1.9, 6.3)
        assert out["action"] == "feed" and out["dose"]["perTree"]["k"] > 0

    def test_salty_soil_holds_a_feed_that_is_due(self):
        out = advise_feed(BLOOM, 76, B, 10, 2.4, 6.3)
        assert out["action"] == "hold" and out["dose"] is None and "2.40" in out["reason"]

    def test_very_salty_soil_asks_for_a_flush(self):
        out = advise_feed(BLOOM, 80, B, 10, 3.2, 6.3)
        assert out["action"] == "flush" and out["dose"] is None

    def test_low_ec_never_raises_the_dose_it_asks_for_a_leaf_test(self):
        normal = advise_feed(BLOOM, 76, B, 10, 1.9, 6.3)
        low = advise_feed(BLOOM, 76, B, 10, 1.0, 6.3)
        assert low["dose"] == normal["dose"]
        assert any("leaf test" in n for n in low["notes"])

    def test_alkaline_soil_changes_the_feed_water(self):
        assert any("acidifying" in n for n in advise_feed(BLOOM, 80, B, 10, 1.9, 7.4)["notes"])

    def test_the_probes_npk_is_never_read(self):
        # the probe cannot measure them well enough (docs/GUAVA-RESEARCH.md): any value must leave the advice unchanged
        low = {"soil_moisture": 60, "nitrogen": 1, "phosphorus": 1, "potassium": 1}
        high = {"soil_moisture": 60, "nitrogen": 900, "phosphorus": 900, "potassium": 900}
        assert tree_litres(ctx(), low) == tree_litres(ctx(), high)
        import inspect
        assert not {"nitrogen", "phosphorus", "potassium"} & set(inspect.signature(advise_feed).parameters)


class TestLooking:
    def test_a_yellow_or_small_tree_is_marked_for_a_look(self):
        rows = advise_trees(ctx(), [tree(0, 72, canopy=0.5), tree(1, 72, canopy=0.5, flagged=True), tree(2, 72, canopy=0.2)])
        assert rows[0]["notes"] == [] and "Yellow leaves: look" in rows[1]["notes"] and "Small canopy: look" in rows[2]["notes"]

    def test_salty_tree_is_named(self):
        rows = advise_trees(ctx(), [tree(0, 72, readings={"soil_ec": 2.6})])
        assert "Salty: no feed" in rows[0]["notes"]


class TestGrowth:
    def rounds(self, *canopies):
        return [{"at": str(i), "canopy": c, "yellow": 0.1} for i, c in enumerate(canopies)]

    def test_stress_should_shed_and_the_flush_should_grow(self):
        assert advisor.growth(self.rounds(0.4, 0.39, 0.38, 0.37), STRESS)["verdict"] == "ok"
        assert advisor.growth(self.rounds(0.3, 0.32, 0.33, 0.34), STRESS)["verdict"] == "warn"
        assert advisor.growth(self.rounds(0.3, 0.32, 0.33, 0.34), FLUSH)["verdict"] == "ok"
        assert advisor.growth(self.rounds(0.34, 0.34, 0.34, 0.34), FLUSH)["verdict"] == "warn"

    def test_after_the_flush_it_should_hold(self):
        assert advisor.growth(self.rounds(0.5, 0.5, 0.5, 0.49), BULK)["verdict"] == "ok"
        assert advisor.growth(self.rounds(0.5, 0.48, 0.46, 0.44), BULK)["verdict"] == "warn"

    def test_too_few_rounds_say_so_rather_than_guess(self):
        assert advisor.growth(self.rounds(0.5, 0.5), BULK)["verdict"] == "wip"
        assert advisor.growth([], BULK) is None


class TestTodo:
    def base(self, **over):
        feed = advise_feed(BLOOM, 80, B, 3, 1.9, 6.3)
        args = dict(trees=advise_trees(ctx(), [tree(0, 72), tree(1, 60), tree(2, 60)]), water_litres=50.0, feed=feed, stage=BLOOM, stress=False,
                    raining=False, alerts=[], hours=4.0, firmware_limit_s=90)
        return advisor.todo(**{**args, **over})

    def test_it_says_which_trees_get_how_much(self):
        water = self.base()[0]
        assert water["text"] == "Water 2 of 3 trees: 50 L"
        assert "R1 T2" in water["detail"] and "90 s" in water["detail"]

    def test_critical_alerts_come_first(self):
        alert = {"severity": "critical", "title": "Salt stress", "message": "x"}
        assert self.base(alerts=[alert])[0]["text"] == "Salt stress"

    def test_trees_to_look_at_are_one_line_per_kind(self):
        trees = advise_trees(ctx(), [tree(0, 72, flagged=True), tree(1, 72, flagged=True), tree(2, 72)])
        look = [t for t in self.base(trees=trees) if t["kind"] == "look"]
        assert [t["text"] for t in look] == ["Look at 2 trees with yellow leaves"]
        assert look[0]["detail"] == "R1 T1, R1 T2"

    def test_stress_and_rain_say_why_there_is_no_water(self):
        assert "stress" in self.base(stress=True, stage=STRESS)[0]["text"]
        assert "raining" in self.base(raining=True)[0]["text"]


# ---- the rules on readings, ported from the sample data's tests

NOW = datetime(2026, 11, 5, 8, 0, tzinfo=timezone.utc)


def rate(day, stress=False, recent_min=None, fruit_mm=None, bagged=False, **values):
    readings = {k: Reading(v, NOW - timedelta(hours=1)) for k, v in values.items()}
    return guava.rate_bed(readings, day, now=NOW, stress=stress, recent_min=recent_min, fruit_mm=fruit_mm, bagged=bagged)


def status_of(result, metric):
    return next(p["status"] for p in result["params"] if p["metric"] == metric)


def alert_ids(result):
    return [a["id"] for a in result["alerts"]]


class TestRules:
    def test_stages_cover_every_day_without_a_gap(self):
        assert [guava.stage_of(d).n for d in (1, 45, 46, 75, 76, 105, 106, 145, 146, 180, 200)] == [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]

    def test_dry_soil_is_right_during_stress_and_wrong_afterwards(self):
        assert status_of(rate(30, stress=True, soil_moisture=26), "soil_moisture") == "normal"
        assert status_of(rate(60, soil_moisture=26), "soil_moisture") == "warning"

    def test_moisture_under_the_bloom_floor_is_critical(self):
        r = rate(90, soil_moisture=52)
        assert status_of(r, "soil_moisture") == "critical" and "bloom_floor" in alert_ids(r)

    def test_a_jump_after_a_dry_spell_warns_of_cracking(self):
        assert "cracking" in alert_ids(rate(165, soil_moisture=82, recent_min=33))
        assert "cracking" not in alert_ids(rate(165, soil_moisture=82, recent_min=50))

    def test_bagging_alert_goes_when_the_task_is_done(self):
        assert "bag_now" in alert_ids(rate(120, fruit_mm=34, air_temperature=27, air_humidity=60))
        assert "bag_now" not in alert_ids(rate(120, fruit_mm=34, bagged=True, air_temperature=27, air_humidity=60))

    def test_npk_is_shown_but_never_rated(self):
        r = rate(90, nitrogen=1)
        assert status_of(r, "nitrogen") == "unrated" and r["status"] != "critical"

    def test_humidity_threatens_the_stress_before_it_is_fungal(self):
        assert "stress_humidity" in alert_ids(rate(30, stress=True, air_humidity=88))
        assert "fungal" in alert_ids(rate(90, air_humidity=88))

    def test_readings_from_two_days_ago_are_not_rated_and_raise_nothing(self):
        old = {"soil_moisture": Reading(52, NOW - timedelta(hours=40))}
        r = guava.rate_bed(old, 90, now=NOW)
        assert status_of(r, "soil_moisture") == "stale" and r["alerts"] == []

    def test_yesterdays_round_still_counts(self):
        new = {"soil_moisture": Reading(52, NOW - timedelta(hours=24))}
        assert "bloom_floor" in alert_ids(guava.rate_bed(new, 90, now=NOW))


class TestTasks:
    def test_due_overdue_done_and_later(self):
        jobs = {j["id"]: j["state"] for j in guava.jobs_for(90, {"prune"}, "pruning")}
        assert jobs["prune"] == "done" and jobs["zn_b"] == "overdue" and jobs["bag"] == "later"
        assert {j["id"]: j["state"] for j in guava.jobs_for(80, set(), "pruning")}["zn_b"] == "due"

    def test_a_task_lasting_its_whole_window_is_never_overdue(self):
        hold = next(j for j in guava.jobs_for(60, set(), "withhold") if j["id"] == "hold")
        assert hold["state"] == "past" and hold["ongoing"]

    def test_holding_water_only_applies_to_the_withhold_method(self):
        assert "hold" not in {j["id"] for j in guava.jobs_for(30, set(), "pruning")}

    def test_every_chemical_dose_says_who_to_ask(self):
        assert {j.id for j in guava.JOBS if j.confirm} == {"zn_b", "k_set", "mg_fe", "boron"}

    def test_a_leaf_test_is_on_the_list(self):
        assert any(j.id == "leaf_test" for j in guava.JOBS)


class TestSetups:
    def test_setups_that_do_not_multiply_out_say_so(self):
        assert SETUP_BY_ID["wide"].doc_issue and SETUP_BY_ID["hedgerow"].doc_issue
        assert not SETUP_BY_ID["commercial"].doc_issue and not SETUP_BY_ID["meadow"].doc_issue

    def test_trees_for_an_area(self):
        assert B.trees_for_area(105) == 10 and SETUP_BY_ID["meadow"].trees_for_area(50) == 25

    def test_forecast(self):
        f = B.forecast(10, 1.15)
        assert (f["kgLow"], f["kgHigh"], f["revenueLowUsd"]) == (300, 350, 345)


class TestSymptoms:
    def reads(self, **v):
        return {k: Reading(x, NOW - timedelta(hours=2)) for k, x in v.items()}

    def test_cracking_needs_the_dry_spell_and_the_jump(self):
        assert guava.correlate("cracking", self.reads(soil_moisture=82, soil_ph=6.2), 33, NOW)["verdict"] == "supported"
        assert guava.correlate("cracking", self.reads(soil_moisture=82, soil_ph=6.2), 50, NOW)["verdict"] == "not_supported"

    def test_fruit_fly_needs_warmth_and_humidity_together(self):
        assert guava.correlate("fruit_fly", self.reads(air_temperature=29, air_humidity=76), None, NOW)["verdict"] == "supported"
        assert guava.correlate("fruit_fly", self.reads(air_temperature=29, air_humidity=60), None, NOW)["verdict"] == "not_supported"

    def test_no_readings_is_no_answer(self):
        assert guava.correlate("anthracnose", {}, None, NOW)["verdict"] == "no_data"

    def test_a_photo_label_finds_its_symptom(self):
        assert guava.match_symptom("guava_anthracnose") == "anthracnose"
        assert guava.match_symptom("healthy") is None
