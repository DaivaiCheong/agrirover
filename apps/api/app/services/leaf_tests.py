"""Leaf samples and lab results: which block is short of what, against the ranges in services/guava.py.

Every row here is a real entry. There is no sample data: a made-up lab result could be taken for a measured one.
Nothing here changes a dose yet: advice does not read these results.
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Farm, LeafResult, LeafSample, Planting, Zone
from app.services import guava
from app.services.clock import farm_today
from app.services.errors import Invalid, NotFound

BLOOM = 3       # the stage the published ranges were sampled at


def _text(value: str | None) -> str | None:
    return (value or "").strip() or None


def _result(r: LeafResult) -> dict:
    n = guava.LEAF_BY_CODE[r.nutrient]
    value = float(r.value)
    return {"nutrient": r.nutrient, "symbol": n.symbol, "value": value, "unit": r.unit, "inBase": round(guava.leaf_in_base(r.nutrient, value, r.unit), 3),
            "base": n.base, "status": guava.rate_leaf(r.nutrient, value, r.unit)}


def _sample(s: LeafSample, zone: Zone | None, results: list[LeafResult]) -> dict:
    stage = guava.stage_of(s.crop_day)
    order = {n.code: i for i, n in enumerate(guava.LEAF_NUTRIENTS)}
    rows = [_result(r) for r in sorted(results, key=lambda r: order[r.nutrient])]
    def of(status: str) -> list[str]:
        return [r["symbol"] for r in rows if r["status"] == status]
    tree = None if s.tree_row is None or s.tree_col is None else f"R{s.tree_row + 1} T{s.tree_col + 1}"
    return {"id": str(s.id), "zone": zone.name if zone else None, "zoneLabel": (zone.label or zone.name) if zone else None, "variety": s.variety,
            "takenOn": s.taken_on.isoformat(), "cropDay": s.crop_day, "stage": stage.short, "atBloom": stage.n == BLOOM, "tree": tree,
            "leafPairs": s.leaf_pairs, "collectedBy": s.collected_by, "note": s.note, "lab": s.lab, "resultsOn": s.results_on.isoformat() if s.results_on else None,
            "results": rows, "low": of("low"), "high": of("high"), "check": of("check")}


async def _zone(session: AsyncSession, farm: Farm, name: str) -> Zone:
    zone = await session.scalar(select(Zone).where(Zone.farm_id == farm.id, Zone.name == name))
    if zone is None:
        raise NotFound(f"unknown block {name!r}")
    return zone


async def _planting_on(session: AsyncSession, zone: Zone, on: date) -> Planting | None:
    return await session.scalar(select(Planting).where(Planting.zone_id == zone.id, Planting.planted_on <= on,
                                                       or_(Planting.ended_on.is_(None), Planting.ended_on >= on))
                                .order_by(Planting.planted_on.desc()).limit(1))


async def _get(session: AsyncSession, farm: Farm, sample_id: uuid.UUID) -> tuple[LeafSample, Zone | None]:
    found = (await session.execute(select(LeafSample, Zone).outerjoin(Zone, LeafSample.zone_id == Zone.id).where(LeafSample.id == sample_id))).first()
    if found is None or (found[1] is not None and found[1].farm_id != farm.id):
        raise NotFound("no such leaf sample")
    return found[0], found[1]


async def _results_of(session: AsyncSession, sample_id: uuid.UUID) -> list[LeafResult]:
    return list(await session.scalars(select(LeafResult).where(LeafResult.sample_id == sample_id)))


async def create(session: AsyncSession, farm: Farm, *, zone_name: str, taken_on: date, leaf_pairs: int, row: int | None = None, col: int | None = None,
                 collected_by: str | None = None, note: str | None = None) -> dict:
    """Record leaves taken. `row` and `col` count from 0, as the rover's do; neither means leaves from across the block."""
    if (row is None) != (col is None):
        raise Invalid("give both the row and the tree, or neither")
    if taken_on > farm_today():
        raise Invalid("the date taken cannot be in the future")
    zone = await _zone(session, farm, zone_name)
    planting = await _planting_on(session, zone, taken_on)
    if planting is None:
        raise Invalid(f"no crop was growing in {zone.label or zone.name} on {taken_on.isoformat()}")
    sample = LeafSample(zone_id=zone.id, planting_id=planting.id, variety=planting.variety, taken_on=taken_on, crop_day=guava.days_between(planting.planted_on, taken_on),
                        tree_row=row, tree_col=col, leaf_pairs=leaf_pairs, collected_by=_text(collected_by), note=_text(note))
    session.add(sample)
    await session.commit()
    return _sample(sample, zone, [])


async def save_results(session: AsyncSession, farm: Farm, sample_id: uuid.UUID, *, lab: str | None, results_on: date | None, values: list[dict]) -> dict:
    """What the lab reported replaces what was entered before. An empty list clears it: the sample is waiting for its result again."""
    sample, zone = await _get(session, farm, sample_id)
    codes = [v["nutrient"] for v in values]
    unknown = [c for c in codes if c not in guava.LEAF_BY_CODE]
    if unknown:
        raise Invalid(f"unknown nutrient {unknown[0]!r}")
    if len(set(codes)) != len(codes):
        raise Invalid("a nutrient was given twice")
    bad = [v["unit"] for v in values if v["unit"] not in guava.LEAF_UNITS]
    if bad:
        raise Invalid(f"unknown unit {bad[0]!r}; use {', '.join(guava.LEAF_UNITS)}")
    lab = _text(lab)
    if values:
        if lab is None:
            raise Invalid("say which lab reported this")
        results_on = results_on or farm_today()
        if results_on < sample.taken_on:
            raise Invalid("the result cannot be dated before the leaves were taken")
        if results_on > farm_today():
            raise Invalid("the result date cannot be in the future")
    for old in await _results_of(session, sample.id):
        await session.delete(old)
    await session.flush()
    rows = [LeafResult(sample_id=sample.id, nutrient=v["nutrient"], source="lab", value=v["value"], unit=v["unit"]) for v in values]
    session.add_all(rows)
    sample.lab, sample.results_on = (lab[:120], results_on) if values else (None, None)
    await session.commit()
    return _sample(sample, zone, rows)


async def delete(session: AsyncSession, farm: Farm, sample_id: uuid.UUID) -> None:
    sample, _ = await _get(session, farm, sample_id)
    await session.delete(sample)
    await session.commit()


def compare(samples: list[dict]) -> list[dict]:
    """Each block's newest result from leaves across the block. A one-tree sample says nothing about a block. `samples` is newest first."""
    out: dict[str, dict] = {}
    for s in samples:
        if s["zone"] and not s["tree"] and s["results"] and s["zone"] not in out:
            out[s["zone"]] = {"zone": s["zone"], "label": s["zoneLabel"], "takenOn": s["takenOn"], "stage": s["stage"], "variety": s["variety"],
                              "values": {r["nutrient"]: {"inBase": r["inBase"], "status": r["status"]} for r in s["results"]}}
    return sorted(out.values(), key=lambda c: c["label"])


async def overview(session: AsyncSession, farm: Farm) -> dict:
    found = (await session.execute(select(LeafSample, Zone).outerjoin(Zone, LeafSample.zone_id == Zone.id)
                                   .where(or_(Zone.farm_id == farm.id, LeafSample.zone_id.is_(None)))
                                   .order_by(LeafSample.taken_on.desc(), LeafSample.created_at.desc()))).all()
    by_sample: dict[uuid.UUID, list[LeafResult]] = {}
    if found:
        for r in await session.scalars(select(LeafResult).where(LeafResult.sample_id.in_([s.id for s, _ in found]))):
            by_sample.setdefault(r.sample_id, []).append(r)
    samples = [_sample(s, z, by_sample.get(s.id, [])) for s, z in found]
    with_results = [s for s in samples if s["results"]]

    today = farm_today()
    growing = await session.execute(select(Zone, Planting).join(Planting, Planting.zone_id == Zone.id)
                                    .where(Zone.farm_id == farm.id, Planting.ended_on.is_(None)).order_by(Zone.name))
    blocks = [{"zone": z.name, "label": z.label or z.name, "variety": p.variety, "day": guava.days_between(p.planted_on, today),
               "stage": guava.stage_of(guava.days_between(p.planted_on, today)).short} for z, p in growing.all()]
    return {"samples": samples, "total": len(samples), "waiting": len(samples) - len(with_results), "withResults": len(with_results),
            "outOfRange": sum(1 for s in with_results if s["low"] or s["high"]), "compare": compare(samples), "blocks": blocks,
            "nutrients": [n.to_dict() for n in guava.LEAF_NUTRIENTS], "units": list(guava.LEAF_UNITS), "rangeSource": guava.LEAF_RANGE_SOURCE}
