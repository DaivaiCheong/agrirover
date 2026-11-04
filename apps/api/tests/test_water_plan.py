"""Water planner: plants x crop day -> litres per day, and the whole cycle in m3.

Method: FAO-56 single crop coefficient. ETc (mm/day) = Kc(day) x ET0. One mm over one
m2 is one litre, so litres per plant per day = ETc x area per plant. Irrigation water
(gross) = net / efficiency."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import water_plan as wp

T = wp.CROPS["tomato"]
client = TestClient(app)


# ------------------------------------------------ Kc by day (FAO-56, tomato)

def test_kc_follows_the_four_fao_stages():
    # initial stage: flat at Kc ini
    assert wp.kc_for_day(T, 1) == pytest.approx(0.6) and wp.kc_for_day(T, 30) == pytest.approx(0.6)
    # development: straight line from Kc ini to Kc mid over 40 days
    assert wp.kc_for_day(T, 31) == pytest.approx(0.6 + 0.55 / 40)
    assert wp.kc_for_day(T, 70) == pytest.approx(1.15)
    # mid season: flat at Kc mid
    assert wp.kc_for_day(T, 71) == pytest.approx(1.15) and wp.kc_for_day(T, 110) == pytest.approx(1.15)
    # late season: line down to Kc end over 25 days
    assert wp.kc_for_day(T, 111) == pytest.approx(1.15 - 0.35 / 25)
    assert wp.kc_for_day(T, 135) == pytest.approx(0.80)


def test_stage_names():
    assert [wp.stage_for_day(T, d) for d in (1, 31, 71, 111)] == ["initial", "development", "mid-season", "late season"]


def test_days_outside_the_cycle_are_refused():
    for bad in (0, 136):
        with pytest.raises(ValueError):
            wp.kc_for_day(T, bad)


# ------------------------------------------------------------ the arithmetic

def test_one_plant_one_day():
    p = wp.plan(T, plants=1, area_per_plant_m2=0.5, et0_mm_day=4.5, efficiency=0.9)
    mid = p.days[80 - 1]                                   # day 80: Kc 1.15
    assert mid.etc_mm == pytest.approx(1.15 * 4.5)         # 5.175 mm/day
    assert mid.liters_per_plant_net == pytest.approx(5.175 * 0.5)          # 2.5875 L
    assert mid.liters_per_plant_gross == pytest.approx(5.175 * 0.5 / 0.9)  # 2.875 L
    assert mid.liters_total_gross == pytest.approx(5.175 * 0.5 / 0.9)


def test_whole_cycle_in_cubic_metres_matches_a_hand_calculation():
    # Sum of Kc over the 135 days, worked by hand:
    #   initial 30 x 0.6 = 18 ; development 24 + 0.01375 x 820 = 35.275
    #   mid 40 x 1.15 = 46    ; late 28.75 - 0.014 x 325 = 24.2   -> 123.475
    # x ET0 4.5 = 555.6375 mm.  100 plants x 0.5 m2 = 50 m2 -> 27.781875 m3 net.
    p = wp.plan(T, plants=100, area_per_plant_m2=0.5, et0_mm_day=4.5, efficiency=0.9)
    assert p.cycle_days == 135
    assert p.net_m3 == pytest.approx(27.781875)
    assert p.gross_m3 == pytest.approx(27.781875 / 0.9)
    assert p.peak_liters_per_day == pytest.approx(100 * 5.175 * 0.5 / 0.9)   # at mid season


def test_water_scales_with_the_number_of_plants():
    one = wp.plan(T, 100, 0.5, 4.5, 0.9).gross_m3
    assert wp.plan(T, 200, 0.5, 4.5, 0.9).gross_m3 == pytest.approx(2 * one)


def test_stage_lengths_can_be_changed_for_a_variety():
    p = wp.plan(T, 100, 0.5, 4.5, 0.9, stage_days=(20, 30, 30, 20))
    assert p.cycle_days == 100 and len(p.days) == 100
    assert p.days[-1].kc == pytest.approx(0.80)
    assert p.gross_m3 < wp.plan(T, 100, 0.5, 4.5, 0.9).gross_m3


def test_nonsense_inputs_are_refused():
    for kwargs in ({"plants": 0}, {"area_per_plant_m2": 0}, {"et0_mm_day": 0}, {"efficiency": 0},
                   {"efficiency": 1.2}, {"stage_days": (0, 40, 40, 25)}):
        args = {"plants": 100, "area_per_plant_m2": 0.5, "et0_mm_day": 4.5, "efficiency": 0.9, **kwargs}
        with pytest.raises(ValueError):
            wp.plan(T, **args)


# --------------------------------------------------------- where is today?

def test_today_in_the_cycle():
    p = wp.plan(T, 100, 0.5, 4.5, 0.9)
    assert wp.position(p, date(2026, 10, 14), date(2026, 11, 4)).day == 22          # 21 days later = day 22
    assert wp.position(p, date(2026, 11, 4), date(2026, 11, 4)).day == 1
    assert wp.position(p, date(2026, 11, 5), date(2026, 11, 4)) is None            # not planted yet
    assert wp.position(p, date(2026, 1, 1), date(2026, 11, 4)) is None             # cycle finished


# --------------------------------------------------------------------- API

BODY = {"crop": "tomato", "plants": 100, "areaPerPlantM2": 0.5, "et0MmDay": 4.5, "efficiency": 0.9}


def test_api_returns_totals_and_a_daily_table():
    r = client.post("/api/v1/water-plan", json={**BODY, "plantedOn": "2026-10-14", "today": "2026-11-04"})
    assert r.status_code == 200
    b = r.json()
    assert b["cycleDays"] == 135 and len(b["days"]) == 135
    assert b["netM3"] == pytest.approx(27.781875, rel=1e-4)
    assert b["grossM3"] == pytest.approx(30.8687, rel=1e-4)
    assert b["today"]["day"] == 22 and b["today"]["stage"] == "initial"        # days 1-30 are the initial stage
    assert "FAO" in b["source"] and b["assumptions"]["et0MmDay"] == 4.5


def test_api_without_a_planting_date_has_no_today():
    assert client.post("/api/v1/water-plan", json=BODY).json()["today"] is None


def test_api_rejects_bad_input():
    for patch in ({"plants": 0}, {"efficiency": 0}, {"et0MmDay": -1}, {"crop": "unobtainium"}):
        assert client.post("/api/v1/water-plan", json={**BODY, **patch}).status_code == 422


def test_api_lists_crops_with_their_source_and_defaults():
    crops = client.get("/api/v1/water-plan/crops").json()
    tomato = next(c for c in crops if c["id"] == "tomato")
    assert tomato["stageDays"] == [30, 40, 40, 25] and tomato["kc"] == {"ini": 0.6, "mid": 1.15, "end": 0.8}
    assert "FAO" in tomato["source"]
