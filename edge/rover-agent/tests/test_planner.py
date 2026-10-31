import pytest

from rover.planner import Cell, path_stats, plan, serpentine, wrap_deg


def test_serpentine_visits_every_cell_once():
    path = serpentine(4, 7)
    assert len(path) == 28
    assert set(path) == {Cell(r, c) for r in range(4) for c in range(7)}


def test_serpentine_steps_are_adjacent():
    path = serpentine(5, 6)
    for a, b in zip(path, path[1:]):
        assert abs(a.row - b.row) + abs(a.col - b.col) == 1


def test_plan_turns_only_at_row_ends():
    rows, cols = 3, 5
    legs = plan(serpentine(rows, cols), 0.5)
    assert legs[0] == []
    stats = path_stats(legs)
    assert stats["distance_m"] == pytest.approx((rows * cols - 1) * 0.5)
    assert stats["turns"] == 2 * (rows - 1)          # two 90-degree turns per lane change
    assert stats["turn_deg"] == pytest.approx(180.0 * (rows - 1))


def test_single_row_needs_no_turns():
    assert path_stats(plan(serpentine(1, 6), 0.5))["turns"] == 0


def test_plan_rejects_jumps():
    with pytest.raises(ValueError):
        plan([Cell(0, 0), Cell(0, 2)], 0.5)


@pytest.mark.parametrize("deg,expected", [(270, -90), (-270, 90), (180, 180), (-180, 180), (360, 0)])
def test_wrap(deg, expected):
    assert wrap_deg(deg) == pytest.approx(expected)
