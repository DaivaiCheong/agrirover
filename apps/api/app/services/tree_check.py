"""One tree, as the rover last found it: the soil under it against its stage's targets, and what that soil says about
yellow leaves. A person's photo of the same tree is then read beside it.

The rover's camera is not built yet, so for now a person is the camera: the round says which trees to look at, someone
photographs one, and the answer uses that tree's own probe readings rather than the block's average. Row and tree count
from 0, as the rover's do. A likely reason from the soil, never a diagnosis.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import guava
from app.services.advice import latest_round
from app.services.conditions import load_snapshots
from app.services.errors import Invalid
from app.services.rule_engine import utcnow

SOIL = ("soil_moisture", "soil_ec", "soil_ph")


def tree_name(row: int, col: int) -> str:
    return f"R{row + 1} T{col + 1}"


def _state(value: float | None, band: guava.Band | None) -> str | None:
    if value is None or band is None:
        return None
    return "low" if value < band.lo else "high" if value > band.hi else "ok"


async def tree_context(session: AsyncSession, farm_name: str, zone_name: str, row: int, col: int, now: datetime | None = None) -> dict:
    """What the rover's newest fresh round knows about one tree. An unknown block raises NotFound."""
    now = now or utcnow()
    if row < 0 or col < 0:
        raise Invalid("row and tree count from 1")
    snap = (await load_snapshots(session, farm_name, now, zone_name))[0]
    out = {"zone": snap.zone.name, "name": tree_name(row, col), "row": row, "col": col, "found": False,
           "roundAt": None, "simulated": False, "stage": None, "flagged": False, "readings": [], "soil": None}
    if snap.planting is None or snap.day is None:
        return out
    stage = guava.stage_of(snap.day)
    stress = snap.planting.regulation == "withhold"
    out["stage"] = stage.title
    mission, trees = await latest_round(session, snap.zone.id, now)
    tree = next((t for t in trees if t["row"] == row and t["col"] == col), None)
    if mission is None or tree is None or not tree.get("plant"):
        return out
    values = tree.get("readings") or {}
    bands = guava.bands(stage, stress)
    out.update(found=True, roundAt=mission.completed_at.isoformat() if mission.completed_at else None, simulated=bool(mission.simulated),
               flagged=bool(tree.get("flagged")))
    for metric in SOIL:
        label, short, unit, decimals = guava.META[metric]
        band, value = bands.get(metric), values.get(metric)
        out["readings"].append({"metric": metric, "label": short, "unit": unit, "value": None if value is None else round(float(value), decimals),
                                "low": band.lo if band else None, "high": band.hi if band else None, "state": _state(value, band)})
    why = guava.why_yellow(stage, stress, values)
    out["soil"] = {"cause": why["cause"], "text": why["text"], "action": why["action"]}
    return out
