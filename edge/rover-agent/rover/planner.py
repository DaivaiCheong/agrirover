"""The daily round: every tree of an orchard block, once.

Trees stand in rows, so the rover visits them in serpentine (boustrophedon) order:
along row 0 eastwards, across to the next row, along row 1 westwards, and so on.
A cell here is one tree. The path never crosses itself, so the wheels do not cross
ground already driven, and each stop is next to the last.

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


def _forward(metres: float, max_step_m: float | None) -> list[Move]:
    """One move, or several no longer than the longest step the drive will take."""
    if not max_step_m or metres <= max_step_m:
        return [Move("forward", metres)]
    pieces = math.ceil(metres / max_step_m - 1e-9)
    return [Move("forward", metres / pieces)] * pieces


def plan(path: list[Cell], cell_m: float, start_heading: float = 0.0, row_m: float | None = None,
         max_step_m: float | None = None) -> list[list[Move]]:
    """Moves to reach each tree of `path`. legs[i] takes the rover from path[i-1]
    to path[i]; legs[0] is empty because the rover starts at the first tree.
    cell_m is tree to tree along a row, row_m between rows (the same if not given)."""
    if cell_m <= 0 or (row_m is not None and row_m <= 0):
        raise ValueError("spacing must be positive")
    row_m = row_m or cell_m
    legs: list[list[Move]] = [[]]
    heading = start_heading
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
