"""Plant maps: where the plants stand in a block, so the rover goes from plant to plant.

A block gets a grid of spots (rows, spots in a row, spacing) and a list of the spots that hold a plant. The Rover
screen draws it, a person places or removes plants on it, and a round stops at the plants only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import Farm, IrrigationRule, PlantMap, Zone
from app.routers._deps import farm_dep
from app.services.crops import slugify
from app.services.errors import Conflict, NotFound

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
        seen = set()
        for r, c in self.plants:
            if not (0 <= r < self.rows and 0 <= c < self.cols):
                raise ValueError(f"plant at row {r + 1}, spot {c + 1} is outside the {self.rows} x {self.cols} grid")
            seen.add((r, c))
        self.plants = sorted(seen)                    # one plant a spot, in a steady order
        return self


class NewBlockIn(MapIn):
    label: str = Field(min_length=1, max_length=80)


def map_dict(zone: Zone, m: PlantMap) -> dict:
    return {"zone": zone.name, "label": zone.label or zone.name, "crop": m.crop, "rows": m.rows, "cols": m.cols,
            "rowM": float(m.row_m), "plantM": float(m.plant_m), "plants": [list(p) for p in m.plants],
            "updatedAt": m.updated_at.isoformat() if m.updated_at else None}


@router.get("")
async def list_maps(farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    rows = await session.execute(select(Zone, PlantMap).join(PlantMap, PlantMap.zone_id == Zone.id)
                                 .where(Zone.farm_id == farm.id).order_by(Zone.name))
    return [map_dict(z, m) for z, m in rows.all()]


@router.post("", status_code=201)
async def new_block(body: NewBlockIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    """A new block with its plant map, for example the tomato demo: the block, then its grid and plants."""
    name = slugify(body.label)
    if (await session.execute(select(Zone).where(Zone.farm_id == farm.id, Zone.name == name))).scalar_one_or_none():
        raise Conflict(f"a block named {body.label!r} already exists")
    zone = Zone(farm_id=farm.id, name=name, label=body.label.strip(), area_m2=round(body.rows * body.row_m * body.cols * body.plant_m, 2))
    session.add(zone)
    await session.flush()
    session.add(IrrigationRule(zone_id=zone.id))       # every block has one, with the engine's defaults
    m = PlantMap(zone_id=zone.id, crop=body.crop.strip(), rows=body.rows, cols=body.cols, row_m=body.row_m,
                 plant_m=body.plant_m, plants=[list(p) for p in body.plants])
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return map_dict(zone, m)


@router.put("/{zone_name}")
async def save_map(zone_name: str, body: MapIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    """Set a block's grid and where its plants stand. A block without a map gets one."""
    zone = (await session.execute(select(Zone).where(Zone.farm_id == farm.id, Zone.name == zone_name))).scalar_one_or_none()
    if zone is None:
        raise NotFound(f"no block named {zone_name!r}")
    m = await session.get(PlantMap, zone.id)
    if m is None:
        m = PlantMap(zone_id=zone.id)
        session.add(m)
    m.crop, m.rows, m.cols, m.row_m, m.plant_m = body.crop.strip(), body.rows, body.cols, body.row_m, body.plant_m
    m.plants = [list(p) for p in body.plants]
    await session.commit()
    await session.refresh(m)
    return map_dict(zone, m)
