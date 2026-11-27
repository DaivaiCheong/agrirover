import pytest

from rover.planner import ALONG, CORNERS, Cell, path_stats, plan, route, serpentine, start_heading, wrap_deg


@pytest.mark.parametrize("start", CORNERS)
@pytest.mark.parametrize("along", ALONG)
@pytest.mark.parametrize("rows,cols", [(1, 1), (1, 5), (4, 1), (3, 4), (4, 3)])
def test_route_visits_every_tree_once_in_adjacent_steps(start, along, rows, cols):
    path = route(rows, cols, start, along)
    assert len(path) == rows * cols
    assert set(path) == {Cell(r, c) for r in range(rows) for c in range(cols)}
    for a, b in zip(path, path[1:]):
        assert abs(a.row - b.row) + abs(a.col - b.col) == 1


@pytest.mark.parametrize("start,first", [("sw", Cell(0, 0)), ("se", Cell(0, 3)), ("nw", Cell(2, 0)), ("ne", Cell(2, 3))])
def test_route_starts_in_the_chosen_corner(start, first):
    assert route(3, 4, start)[0] == first
    assert route(3, 4, start, "across")[0] == first


def test_route_default_is_the_old_serpentine():
    assert route(4, 7) == serpentine(4, 7)


def test_route_along_rows_and_across():
    assert route(2, 3, "se") == [Cell(0, 2), Cell(0, 1), Cell(0, 0), Cell(1, 0), Cell(1, 1), Cell(1, 2)]
    assert route(2, 3, "sw", "across") == [Cell(0, 0), Cell(1, 0), Cell(1, 1), Cell(0, 1), Cell(0, 2), Cell(1, 2)]
    assert route(2, 2, "ne", "across") == [Cell(1, 1), Cell(0, 1), Cell(0, 0), Cell(1, 0)]


def test_route_refuses_unknown_options():
    with pytest.raises(ValueError):
        route(2, 2, "middle")
    with pytest.raises(ValueError):
        route(2, 2, "sw", "diagonal")


def test_rover_starts_facing_its_second_stop_so_the_first_leg_has_no_turn():
    assert start_heading(route(3, 4, "ne")) == 180.0           # west along the last row
    assert start_heading(route(3, 4, "sw", "across")) == 90.0  # north up tree 1
    assert start_heading([Cell(0, 0)]) == 0.0
    for start in CORNERS:
        for along in ALONG:
            legs = plan(route(3, 4, start, along), 0.5)
            assert [m.kind for m in legs[1]] == ["forward"]


def test_across_rows_uses_row_spacing_for_the_long_lanes():
    stats = path_stats(plan(route(3, 2, "sw", "across"), 1.0, row_m=2.0))
    assert stats["distance_m"] == pytest.approx(2 * 2 * 2.0 + 1 * 1.0)   # two lanes of two row-gaps, one tree-gap


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
