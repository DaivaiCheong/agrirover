"""Leaf samples and lab results."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import Farm
from app.routers._deps import farm_dep
from app.services import leaf_tests

router = APIRouter(prefix="/leaf-tests", tags=["leaf tests"])


@router.get("")
async def overview(farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    return await leaf_tests.overview(session, farm)


class SampleIn(BaseModel):
    zone: str
    takenOn: date
    leafPairs: int = Field(ge=1, le=1000)
    row: int | None = Field(None, ge=0)
    col: int | None = Field(None, ge=0)
    collectedBy: str | None = Field(None, max_length=80)
    note: str | None = Field(None, max_length=2000)


@router.post("", status_code=201)
async def add_sample(body: SampleIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    return await leaf_tests.create(session, farm, zone_name=body.zone, taken_on=body.takenOn, leaf_pairs=body.leafPairs, row=body.row, col=body.col,
                                   collected_by=body.collectedBy, note=body.note)


class ValueIn(BaseModel):
    nutrient: str
    value: float = Field(ge=0, lt=10_000_000)
    unit: str


class ResultsIn(BaseModel):
    lab: str | None = Field(None, max_length=120)
    resultsOn: date | None = None
    values: list[ValueIn]


@router.put("/{sample_id}/results")
async def save_results(sample_id: uuid.UUID, body: ResultsIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    """What the lab reported, each figure in its own unit. This replaces what was entered before; an empty list clears it."""
    return await leaf_tests.save_results(session, farm, sample_id, lab=body.lab, results_on=body.resultsOn, values=[v.model_dump() for v in body.values])


@router.delete("/{sample_id}", status_code=204)
async def delete_sample(sample_id: uuid.UUID, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    await leaf_tests.delete(session, farm, sample_id)
