"""Siem Reap weather and FAO-56 Penman-Monteith ET0. Pure, no database."""
from datetime import date

import pytest

from app.services import climate


def test_et0_matches_fao56_worked_example_18():
    """FAO-56 Example 18: Brussels, 6 July. Tmax 21.5, Tmin 12.3, RHmax 84, RHmin 63, wind 2.078 m/s at 2 m,
    Rs 22.07 MJ/m2/day, 50.80 N, 100 m. FAO's answers: Ra 41.09, ETo 3.9 mm/day (3.88)."""
    ea = (climate.es_kpa(12.3) * 0.84 + climate.es_kpa(21.5) * 0.63) / 2
    assert ea == pytest.approx(1.409, abs=0.001)
    assert climate.ra_mj(50.80, 187) == pytest.approx(41.09, abs=0.05)
    assert climate.et0_fao56(21.5, 12.3, ea, 2.078, 22.07, 50.80, 100, 187) == pytest.approx(3.88, abs=0.03)


def test_saturation_vapour_pressure_known_values():
    assert climate.es_kpa(20) == pytest.approx(2.338, abs=0.002)        # FAO-56 Table 2.3
    assert climate.es_kpa(30) == pytest.approx(4.243, abs=0.003)


def test_the_monthly_table_is_complete_and_has_the_right_shape():
    for table in (climate.ET0_MM_DAY, climate.TMAX_C, climate.RAIN_MM_DAY):
        assert sorted(table) == list(range(1, 13)) and all(v >= 0 for v in table.values())
    et0 = climate.ET0_MM_DAY
    assert max(et0, key=et0.get) == 4 and min(et0, key=et0.get) == 10   # April is the hungriest month, October the least
    assert 4.0 < sum(et0.values()) / 12 < 5.0
    rain = climate.RAIN_MM_DAY
    assert max(rain, key=rain.get) == 9 and min(rain, key=rain.get) == 12   # the wet season peaks in September


def test_series_follows_the_calendar_across_a_month_end():
    assert climate.et0_series(date(2026, 10, 30), 5) == [3.65, 3.65, 3.83, 3.83, 3.83]
    assert climate.et0_series(date(2026, 12, 30), 3) == [4.18, 4.18, 4.47]    # and across the new year
    assert climate.et0_on(date(2027, 3, 1)) == 5.34
