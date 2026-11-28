"""Plant maps: where the plants stand in a block, so the rover goes from plant to plant.

A block gets a grid of spots (rows, spots in a row, spacing) and the list of spots that hold a plant. Rover › Setup draws
it, a person places or removes plants on it, and a round stops at the plants only. Stored in `plant_maps`, one a bed.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.config import settings
from app.core.db import get_db
from app.services import farm_service
from app.services.errors import NotFound

router = APIRouter(prefix="/plant-maps", tags=["rover"])

MAX_PLANTS = 400          # the rover's own limit on stops in a round


class MapIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    crop: str = Field(default="Tomato", min_length=1, max_length=40)
    rows: int = Field(ge=1, le=40)
    cols: int = Field(ge=1, le=40)
    row_m: float = Field(ge=0.2, le=10)
    plant_m: float = Field(ge=0.2, le=10)
    plants: list[tuple[int, int]] = Field(default_factory=list, max_length=MAX_PLANTS)

    @model_validator(mode="after")
    def _plants_on_the_grid(self) -> "MapIn":
        if self.rows * self.cols > MAX_PLANTS:
            raise ValueError(f"at most {MAX_PLANTS} spots in a block")
        for r, c in self.plants:
            if not (0 <= r < self.rows and 0 <= c < self.cols):
                raise ValueError(f"plant at row {r + 1}, spot {c + 1} is outside the {self.rows} x {self.cols} grid")
        self.plants = sorted(set(self.plants))        # one plant a spot, in a steady order
        return self


class NewBlockIn(MapIn):
    label: str = Field(min_length=1, max_length=80)


def map_dict(zone: dict, m: dict) -> dict:
    return {"zone": zone["zone"], "label": zone.get("label") or zone["zone"], "crop": m["crop"], "rows": m["rows"],
            "cols": m["cols"], "rowM": float(m["rowM"]), "plantM": float(m["plantM"]), "plants": [list(p) for p in m["plants"]],
            "updatedAt": m.get("updatedAt")}


def _doc(farm_name: str, zone: str, body: MapIn) -> dict:
    return {"farmName": farm_name, "zone": zone, "crop": body.crop.strip(), "rows": body.rows, "cols": body.cols,
            "rowM": body.row_m, "plantM": body.plant_m, "plants": [list(p) for p in body.plants],
            "updatedAt": datetime.now(timezone.utc).isoformat()}


@router.get("")
async def list_maps(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    zones = {z["zone"]: z for z in await db.zones.find({"farmName": fname}, {"_id": 0}).to_list(length=500)}
    maps = await db.plant_maps.find({"farmName": fname}, {"_id": 0}).sort("zone", 1).to_list(length=500)
    return [map_dict(zones[m["zone"]], m) for m in maps if m["zone"] in zones]


@router.post("", status_code=201)
async def new_block(body: NewBlockIn, farm: str | None = None, db=Depends(get_db)):
    """A new block with its plant map: the block, then its grid and plants."""
    fname = farm or settings.farm_name
    area = round(body.rows * body.row_m * body.cols * body.plant_m, 2)
    made = await farm_service.add_bed(db, fname, body.label, area)
    m = _doc(fname, made["name"], body)
    await db.plant_maps.update_one({"farmName": fname, "zone": made["name"]}, {"$set": m}, upsert=True)
    return map_dict({"zone": made["name"], "label": made["label"]}, m)


@router.put("/{zone_name}")
async def save_map(zone_name: str, body: MapIn, farm: str | None = None, db=Depends(get_db)):
    """Set a block's grid and where its plants stand. A block without a map gets one."""
    fname = farm or settings.farm_name
    zone = await db.zones.find_one({"farmName": fname, "zone": zone_name}, {"_id": 0})
    if zone is None:
        raise NotFound(f"no block named {zone_name!r}")
    m = _doc(fname, zone_name, body)
    await db.plant_maps.update_one({"farmName": fname, "zone": zone_name}, {"$set": m}, upsert=True)
    return map_dict(zone, m)
