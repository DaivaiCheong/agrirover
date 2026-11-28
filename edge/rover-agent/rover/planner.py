"""The daily round: every tree of an orchard block, once.

Trees stand in rows, so the rover visits them in serpentine (boustrophedon) order:
along row 0 eastwards, across to the next row, along row 1 westwards, and so on.
A cell here is one tree. The path never crosses itself, so the wheels do not cross
ground already driven, and each stop is next to the last.

The person setting up the round chooses the start corner and whether the lanes run
along the rows or across them (route()); the rover is placed on the start tree,
facing its second stop.

Frame: x east (along a row, increasing column), y north (increasing row).
Heading 0 deg = east, 90 deg = north; a positive turn is counter-clockwise.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class Cell:
    row: int
    col: int

    def center(self, cell_m: float) -> tuple[float, float]:
        return ((self.col + 0.5) * cell_m, (self.row + 0.5) * cell_m)


@dataclass(frozen=True)
class Move:
    kind: str        # "turn" | "forward"
    value: float     # degrees for a turn (+ = left), metres for forward


_HEADING = {(0, 1): 0.0, (1, 0): 90.0, (0, -1): 180.0, (-1, 0): -90.0}

# Start corners: s = row 1 (row 0), n = the last row; w = tree 1 (col 0), e = the last tree.
CORNERS = ("sw", "se", "nw", "ne")
# Lanes: along each row (tree to tree), or across the rows (row to row, the same tree number).
ALONG = ("rows", "across")


def wrap_deg(deg: float) -> float:
    """Normalise to (-180, 180]."""
    d = (deg + 180.0) % 360.0 - 180.0
    return 180.0 if d == -180.0 else d


def serpentine(rows: int, cols: int) -> list[Cell]:
    if rows < 1 or cols < 1:
        raise ValueError("grid must be at least 1 x 1")
    path: list[Cell] = []
    for r in range(rows):
        cols_in_order = range(cols) if r % 2 == 0 else range(cols - 1, -1, -1)
        path.extend(Cell(r, c) for c in cols_in_order)
    return path


def route(rows: int, cols: int, start: str = "sw", along: str = "rows") -> list[Cell]:
    """Every tree once, serpentine, from the `start` corner, in lanes `along` the rows or across them."""
    if start not in CORNERS:
        raise ValueError(f"start must be one of {', '.join(CORNERS)}")
    if along not in ALONG:
        raise ValueError(f"along must be one of {', '.join(ALONG)}")
    if along == "rows":
        base = [(c.row, c.col) for c in serpentine(rows, cols)]
    else:                                   # lanes are the columns: walk serpentine on the transposed grid
        base = [(c.col, c.row) for c in serpentine(cols, rows)]
    flip_row, flip_col = start[0] == "n", start[1] == "e"
    return [Cell(rows - 1 - r if flip_row else r, cols - 1 - c if flip_col else c) for r, c in base]


def through_stops(path: list[Cell], stops) -> list[Cell]:
    """The part of `path` from its first stop to its last. The rover drives all of it, through the empty spots
    between, so it never leaves the lanes; it stops only at the stops (the spots that hold a plant)."""
    want = set(stops)
    at = [i for i, cell in enumerate(path) if cell in want]
    if not at:
        raise ValueError("no stop is on the route")
    return path[at[0]:at[-1] + 1]


def start_heading(path: list[Cell]) -> float:
    """The way the rover faces on the start tree: towards its second stop (east for a single tree)."""
    if len(path) < 2:
        return 0.0
    step = (path[1].row - path[0].row, path[1].col - path[0].col)
    if step not in _HEADING:
        raise ValueError(f"cells {path[0]} and {path[1]} are not adjacent")
    return _HEADING[step]


def _forward(metres: float, max_step_m: float | None) -> list[Move]:
    """One move, or several no longer than the longest step the drive will take."""
    if not max_step_m or metres <= max_step_m:
        return [Move("forward", metres)]
    pieces = math.ceil(metres / max_step_m - 1e-9)
    return [Move("forward", metres / pieces)] * pieces


def plan(path: list[Cell], cell_m: float, heading: float | None = None, row_m: float | None = None,
         max_step_m: float | None = None) -> list[list[Move]]:
    """Moves to reach each tree of `path`. legs[i] takes the rover from path[i-1]
    to path[i]; legs[0] is empty because the rover starts at the first tree.
    cell_m is tree to tree along a row, row_m between rows (the same if not given).
    `heading` is the way the rover faces at the start; by default, towards the second stop."""
    if cell_m <= 0 or (row_m is not None and row_m <= 0):
        raise ValueError("spacing must be positive")
    row_m = row_m or cell_m
    legs: list[list[Move]] = [[]]
    if heading is None:
        heading = start_heading(path)
    for a, b in zip(path, path[1:]):
        step = (b.row - a.row, b.col - a.col)
        if step not in _HEADING:
            raise ValueError(f"cells {a} and {b} are not adjacent")
        target = _HEADING[step]
        leg: list[Move] = []
        turn = wrap_deg(target - heading)
        if abs(turn) > 1e-9:
            leg.append(Move("turn", turn))
        leg.extend(_forward(row_m if step[0] else cell_m, max_step_m))
        legs.append(leg)
        heading = target
    return legs


def path_stats(legs: list[list[Move]]) -> dict:
    moves = [m for leg in legs for m in leg]
    return {
        "distance_m": round(sum(m.value for m in moves if m.kind == "forward"), 3),
        "turns": sum(1 for m in moves if m.kind == "turn"),
        "turn_deg": round(sum(abs(m.value) for m in moves if m.kind == "turn"), 1),
    }
