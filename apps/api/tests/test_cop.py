"""Cost of production: the money engine, pure functions, checked against hand calculations.

COP per kg = total cost of the cycle / marketable kg. Costs: entries tied to the cycle, a share
of farm-level entries, a share of equipment depreciation, land rent, and (when nothing was
entered) a water estimate from the planner."""
from datetime import date

import pytest

from app.services import cost
from app.services.errors import Invalid

D = date


def cycle(id="A", start=D(2026, 1, 1), end=D(2026, 1, 10), area=50.0, plants=100):
    return cost.CycleIn(id, start, end, area, plants)


def entry(category, amount, cycle_id="A", day=D(2026, 1, 5)):
    return cost.EntryIn(category, amount, day, cycle_id)


# 3650 over 10 years = exactly 1.00 USD a day, so hand sums stay readable
PUMP = cost.AssetIn(cost_usd=3650, salvage_usd=0, life_years=10, bought_on=D(2025, 1, 1), retired_on=None)

TODAY = D(2026, 1, 10)


# ---------------------------------------------------------------- currency

def test_money_is_converted_to_usd_at_the_given_rate():
    assert cost.to_usd(12.5, "USD", 4000) == 12.5
    assert cost.to_usd(40_000, "KHR", 4000) == pytest.approx(10.0)
    with pytest.raises(Invalid):
        cost.to_usd(100, "KHR", None)
    with pytest.raises(Invalid):
        cost.to_usd(100, "EUR", 4000)


# ------------------------------------------------------------ depreciation

def test_straight_line_depreciation_per_day_and_when_it_stops():
    assert cost.depreciation_per_day(PUMP) == pytest.approx(1.0)
    assert not cost.asset_in_service(PUMP, D(2024, 12, 31))                    # not bought yet
    assert cost.asset_in_service(PUMP, D(2026, 1, 1))
    retired = cost.AssetIn(3650, 0, 10, D(2025, 1, 1), retired_on=D(2026, 1, 5))
    assert cost.asset_in_service(retired, D(2026, 1, 4)) and not cost.asset_in_service(retired, D(2026, 1, 5))
    worn_out = cost.AssetIn(365, 0, 1, D(2025, 1, 1), None)                    # one year of life
    assert cost.asset_in_service(worn_out, D(2025, 12, 31)) and not cost.asset_in_service(worn_out, D(2026, 1, 1))
    salvage = cost.AssetIn(3650, 365, 9, D(2025, 1, 1), None)                  # (3650 - 365) / (9 x 365) = 1.0
    assert cost.depreciation_per_day(salvage) == pytest.approx(1.0)


# ---------------------------------------------------- the worked example

def test_worked_example_one_cycle():
    # Cycle 1-10 Jan 2026 (10 days), 50 m2 = 0.005 ha, 100 plants.
    #   entries   seed 8 + fertilizer 40 + pesticide 25 + hired labour 48 + family labour 120
    #             + services 15 + materials 30                               = 286.00
    #   depreciation pump 1.00/day x 10 days                                 =  10.00
    #   land      365 USD/ha/year x 0.005 ha x 10/365                        =   0.05
    #   water     3.0 m3 x 0.10 USD (estimate, nothing entered)              =   0.30
    #   total                                                                = 296.35
    entries = [entry("seed", 8), entry("fertilizer", 40), entry("pesticide", 25), entry("labour_hired", 48),
               entry("labour_family", 120), entry("services", 15), entry("materials", 30)]
    r = cost.compute_cop(
        cycle(), cycles=[cycle()], entries=entries, assets=[PUMP],
        harvests=[cost.HarvestIn(120, 100, 10)], sales=[cost.SaleIn(80, 320)], today=TODAY,
        land_rent_per_ha_year=365, water_cost_per_m3=0.10, water_m3=3.0)
    lines = {x.category: x for x in r.lines}
    assert lines["depreciation"].amount_usd == pytest.approx(10.0)
    assert lines["land"].amount_usd == pytest.approx(0.05)
    assert lines["water_energy"].amount_usd == pytest.approx(0.30) and lines["water_energy"].estimate
    assert not lines["seed"].estimate
    assert r.total_cost_usd == pytest.approx(296.35)
    assert (r.kg_total, r.kg_marketable, r.kg_home, r.kg_lost) == (120, 100, 10, 10)
    assert r.cop_per_kg == pytest.approx(2.9635)
    assert r.cost_per_plant == pytest.approx(2.9635)
    assert r.cost_per_m2 == pytest.approx(5.927)
    assert r.revenue_usd == 320 and r.margin_usd == pytest.approx(23.65)
    assert r.kg_per_m3_water == pytest.approx(100 / 3.0)
    assert any("estimate" in f for f in r.flags)
    assert r.days == 10 and not r.open


def test_real_water_entries_replace_the_estimate():
    r = cost.compute_cop(cycle(), cycles=[cycle()], entries=[entry("water_energy", 2.0)], assets=[], harvests=[],
                         sales=[], today=TODAY, water_cost_per_m3=0.10, water_m3=3.0)
    water = next(x for x in r.lines if x.category == "water_energy")
    assert water.amount_usd == 2.0 and not water.estimate
    assert r.total_cost_usd == pytest.approx(2.0)


def test_missing_inputs_are_said_not_guessed():
    c = cost.CycleIn("A", D(2026, 1, 1), D(2026, 1, 10), None, None)            # no area, no plants
    r = cost.compute_cop(c, cycles=[c], entries=[entry("seed", 10)], assets=[], harvests=[], sales=[], today=TODAY,
                         land_rent_per_ha_year=None, water_cost_per_m3=None, water_m3=None)
    assert r.cop_per_kg is None and r.cost_per_plant is None and r.cost_per_m2 is None
    assert r.revenue_usd == 0 and r.margin_usd is None                          # no sales, so no margin to show
    text = " ".join(r.flags)
    assert "no harvest" in text and "land" in text and "water" in text
    assert "land" not in {x.category for x in r.lines} and "water_energy" not in {x.category for x in r.lines}


def test_an_open_cycle_counts_days_up_to_today():
    c = cost.CycleIn("A", D(2026, 1, 1), None, 50.0, 100)
    r = cost.compute_cop(c, cycles=[c], entries=[], assets=[PUMP], harvests=[], sales=[], today=D(2026, 1, 4))
    assert r.open and r.days == 4
    assert next(x for x in r.lines if x.category == "depreciation").amount_usd == pytest.approx(4.0)
    assert any("open" in f for f in r.flags)


# ----------------------------------------------- sharing between cycles

def test_equipment_and_overhead_are_shared_by_area():
    a, b = cycle("A", area=30), cycle("B", area=10)
    overhead = cost.EntryIn("overhead", 40.0, D(2026, 1, 5), None)             # farm-level
    ra = cost.compute_cop(a, cycles=[a, b], entries=[overhead], assets=[PUMP], harvests=[], sales=[], today=TODAY)
    rb = cost.compute_cop(b, cycles=[a, b], entries=[overhead], assets=[PUMP], harvests=[], sales=[], today=TODAY)
    dep = lambda r: next(x for x in r.lines if x.category == "depreciation").amount_usd      # noqa: E731
    oh = lambda r: next(x for x in r.lines if x.category == "overhead").amount_usd           # noqa: E731
    assert (dep(ra), dep(rb)) == (pytest.approx(7.5), pytest.approx(2.5))       # 10 days x 30/40 and 10/40
    assert (oh(ra), oh(rb)) == (pytest.approx(30.0), pytest.approx(10.0))


def test_partial_overlap_shares_only_the_days_both_are_growing():
    a = cycle("A", start=D(2026, 1, 1), end=D(2026, 1, 10), area=30)
    c = cycle("C", start=D(2026, 1, 1), end=D(2026, 1, 5), area=10)
    ra = cost.compute_cop(a, cycles=[a, c], entries=[], assets=[PUMP], harvests=[], sales=[], today=TODAY)
    rc = cost.compute_cop(c, cycles=[a, c], entries=[], assets=[PUMP], harvests=[], sales=[], today=TODAY)
    dep = lambda r: next(x for x in r.lines if x.category == "depreciation").amount_usd      # noqa: E731
    assert dep(ra) == pytest.approx(5 * 0.75 + 5 * 1.0)                        # 8.75
    assert dep(rc) == pytest.approx(5 * 0.25)                                  # 1.25
    assert dep(ra) + dep(rc) == pytest.approx(10.0)                            # nothing created or lost


def test_overhead_on_a_day_with_no_cycle_is_not_charged_to_anyone():
    a = cycle("A", start=D(2026, 1, 1), end=D(2026, 1, 10))
    stray = cost.EntryIn("overhead", 99.0, D(2026, 3, 1), None)
    r = cost.compute_cop(a, cycles=[a], entries=[stray], assets=[], harvests=[], sales=[], today=TODAY)
    assert r.total_cost_usd == 0


def test_cycles_without_an_area_split_equally():
    a = cost.CycleIn("A", D(2026, 1, 1), D(2026, 1, 10), None, None)
    b = cost.CycleIn("B", D(2026, 1, 1), D(2026, 1, 10), 40.0, 10)
    r = cost.compute_cop(a, cycles=[a, b], entries=[], assets=[PUMP], harvests=[], sales=[], today=TODAY)
    assert next(x for x in r.lines if x.category == "depreciation").amount_usd == pytest.approx(5.0)


# ------------------------------------------------------------ stock average

def test_stock_moving_average_and_use():
    qty, avg = cost.stock_in(0, 0, 10, 2.0)
    assert (qty, avg) == (10, 2.0)
    qty, avg = cost.stock_in(qty, avg, 10, 4.0)
    assert (qty, avg) == (20, pytest.approx(3.0))
    qty, used_cost = cost.stock_out(qty, avg, 5)
    assert qty == 15 and used_cost == pytest.approx(15.0)
    with pytest.raises(Invalid):
        cost.stock_out(qty, avg, 20)                                            # more than is on the shelf
    with pytest.raises(Invalid):
        cost.stock_out(qty, avg, 0)
