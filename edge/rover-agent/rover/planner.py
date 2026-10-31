"""Coverage planning over a bed divided into a grid of cells.

The rover visits every cell exactly once in serpentine (boustrophedon) order:
along row 0 eastwards, one step north, along row 1 westwards, and so on. Every
step is to an adjacent cell, so no single move is longer than one cell and the
path never crosses itself — dead-reckoning error stays small and the wheels
never cross ground the rover has already surveyed.

Frame: x east (along a row, increasing column), y north (increasing row).
Heading 0 deg = east, 90 deg = north; a positive turn is counter-clockwise.
"""
from __future__ import annotations

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


def plan(path: list[Cell], cell_m: float, start_heading: float = 0.0) -> list[list[Move]]:
    """Moves to reach each cell of `path`. legs[i] takes the rover from path[i-1]
    to path[i]; legs[0] is empty because the rover starts on the first cell."""
    if cell_m <= 0:
        raise ValueError("cell size must be positive")
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
        leg.append(Move("forward", cell_m))
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
