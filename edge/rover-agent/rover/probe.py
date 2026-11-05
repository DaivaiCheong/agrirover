"""The soil probe and air sensor the rover carries from tree to tree.

Every probe returns the readings at one tree, named as the farm server names them. A reading it could not take is
simply missing.

NoProbe    the rover with nothing fitted: it still photographs.
SimProbe   a simulated orchard block, in camera.py's SimField.

The reader for the real RS485 7-in-1 probe is not written yet: it needs the probe's datasheet. Its N, P and K are
inferred from conductivity on low-cost probes, so the server shows them as a trend and never sets a dose from them
(docs/GUAVA-RESEARCH.md).
"""
from __future__ import annotations

from rover.planner import Cell


class NoProbe:
    def read(self, cell: Cell) -> dict:
        return {}


class SimProbe:
    def __init__(self, field):
        self.field = field

    def read(self, cell: Cell) -> dict:
        return self.field.readings(cell)
