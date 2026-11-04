from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import Asset, CostEntry, Farm, StockItem, StockMove
from app.routers._deps import farm_dep
from app.services import cost
from app.services.clock import farm_today
from app.services.errors import Conflict, Invalid, NotFound
from app.services.farm_data import as_uuid, farm_settings, load_cycle

router = APIRouter(tags=["costs"])
Currency = Literal["USD", "KHR"]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _num(v):
    return None if v is None else float(v)


# ------------------------------------------------------------------ costs

class CostIn(_Camel):
    planting_id: str | None = None
    entry_date: date = Field(alias="date")
    category: str
    description: str | None = Field(None, max_length=160)
    qty: float | None = Field(None, ge=0)
    unit: str | None = Field(None, max_length=16)
    unit_price: float | None = Field(None, ge=0)
    amount: float | None = Field(None, ge=0)
    currency: Currency = "USD"


class CostPatch(_Camel):
    planting_id: str | None = None
    entry_date: date | None = Field(None, alias="date")
    category: str | None = None
    description: str | None = Field(None, max_length=160)
    qty: float | None = Field(None, ge=0)
    unit: str | None = Field(None, max_length=16)
    unit_price: float | None = Field(None, ge=0)
    amount: float | None = Field(None, ge=0)
    currency: Currency | None = None


def _entry_dict(e: CostEntry) -> dict:
    return {"id": str(e.id), "plantingId": str(e.planting_id) if e.planting_id else None,
            "date": e.entry_date.isoformat(), "category": e.category, "description": e.description,
            "qty": _num(e.qty), "unit": e.unit, "unitPrice": _num(e.unit_price), "amount": _num(e.amount),
            "currency": e.currency, "amountUsd": _num(e.amount_usd), "rateUsed": _num(e.rate_used),
            "source": e.source}


def _resolve_amount(category: str, qty, unit_price, amount, family_wage):
    """The amount, or quantity x price. Family labour with no price uses the family wage."""
    if amount is not None:
        return amount, unit_price
    if qty is None:
        raise Invalid("enter an amount, or a quantity and a price")
    price = unit_price
    if price is None and category == "labour_family":
        if family_wage is None:
            raise Invalid("set the family wage in Settings, or enter a price per day")
        price = family_wage
    if price is None:
        raise Invalid("enter an amount, or a quantity and a price")
    return round(qty * price, 2), price


def _check_category(category: str) -> None:
    if category not in cost.CATEGORIES:
        raise Invalid(f"unknown category {category!r}; choose from {', '.join(cost.CATEGORIES)}")


@router.get("/costs")
async def list_costs(cycle: str | None = None, category: str | None = None, limit: int = Query(500, ge=1, le=2000),
                     farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    q = select(CostEntry).where(CostEntry.farm_id == farm.id, CostEntry.deleted_at.is_(None))
    if cycle:
        q = q.where(CostEntry.planting_id == as_uuid(cycle, "cycle"))
    if category:
        q = q.where(CostEntry.category == category)
    rows = (await session.execute(q.order_by(CostEntry.entry_date.desc(), CostEntry.created_at.desc()).limit(limit))).scalars()
    return [_entry_dict(e) for e in rows]


@router.post("/costs", status_code=201)
async def add_cost(body: CostIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    _check_category(body.category)
    st = await farm_settings(session, farm)
    planting_id = None
    if body.planting_id:
        planting_id = (await load_cycle(session, farm, body.planting_id))[0].id
    amount, price = _resolve_amount(body.category, body.qty, body.unit_price, body.amount, _num(st.family_wage_usd_per_day))
    rate = _num(st.khr_per_usd)
    e = CostEntry(farm_id=farm.id, planting_id=planting_id, entry_date=body.entry_date, category=body.category,
                  description=body.description, qty=body.qty, unit=body.unit, unit_price=price, amount=amount,
                  currency=body.currency, amount_usd=round(cost.to_usd(amount, body.currency, rate), 2),
                  rate_used=rate if body.currency == "KHR" else None)
    session.add(e)
    await session.commit()
    return _entry_dict(e)


async def _own_entry(session: AsyncSession, farm: Farm, entry_id: str) -> CostEntry:
    e = await session.get(CostEntry, as_uuid(entry_id, "entry"))
    if e is None or e.farm_id != farm.id or e.deleted_at is not None:
        raise NotFound("entry not found")
    return e


@router.patch("/costs/{entry_id}")
async def edit_cost(entry_id: str, body: CostPatch, farm: Farm = Depends(farm_dep),
                    session: AsyncSession = Depends(get_db)):
    """Edit a hand-entered cost. The amount is converted again at today's rate."""
    e = await _own_entry(session, farm, entry_id)
    if e.source != "manual":
        raise Conflict("this cost comes from a stock use; undo the stock use instead")
    st = await farm_settings(session, farm)
    sent = body.model_fields_set
    if "category" in sent and body.category is not None:
        _check_category(body.category)
        e.category = body.category
    if "planting_id" in sent:
        e.planting_id = (await load_cycle(session, farm, body.planting_id))[0].id if body.planting_id else None
    for name in ("entry_date", "description", "qty", "unit", "currency"):
        if name in sent and getattr(body, name) is not None:
            setattr(e, name, getattr(body, name))
    if "unit_price" in sent and body.unit_price is not None:
        e.unit_price = body.unit_price
    if "amount" in sent and body.amount is not None:
        e.amount = body.amount
    elif ("qty" in sent or "unit_price" in sent) and e.qty is not None and e.unit_price is not None:
        e.amount = round(float(e.qty) * float(e.unit_price), 2)
    rate = _num(st.khr_per_usd)
    e.amount_usd = round(cost.to_usd(float(e.amount), e.currency, rate), 2)
    e.rate_used = rate if e.currency == "KHR" else None
    await session.commit()
    return _entry_dict(e)


@router.delete("/costs/{entry_id}", status_code=204)
async def delete_cost(entry_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    e = await _own_entry(session, farm, entry_id)
    if e.source != "manual":
        raise Conflict("this cost comes from a stock use; undo the stock use instead")
    e.deleted_at = datetime.now(timezone.utc)                       # hidden, not erased
    await session.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ stock

class StockItemIn(_Camel):
    name: str = Field(min_length=1, max_length=80)
    category: str
    unit: str = Field(min_length=1, max_length=16)


class StockInIn(_Camel):
    move_date: date = Field(alias="date")
    qty: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    currency: Currency = "USD"


class StockUseIn(_Camel):
    move_date: date = Field(alias="date")
    qty: float = Field(gt=0)
    planting_id: str | None = None


def _item_dict(i: StockItem) -> dict:
    qty, avg = float(i.qty_on_hand), float(i.avg_unit_cost_usd)
    return {"id": str(i.id), "name": i.name, "category": i.category, "unit": i.unit, "qtyOnHand": qty,
            "avgUnitCostUsd": round(avg, 4), "valueUsd": round(qty * avg, 2)}


async def _own_item(session: AsyncSession, farm: Farm, item_id: str) -> StockItem:
    i = await session.get(StockItem, as_uuid(item_id, "stock item"))
    if i is None or i.farm_id != farm.id:
        raise NotFound("stock item not found")
    return i


@router.get("/stock/items")
async def list_stock(farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(StockItem).where(StockItem.farm_id == farm.id)
                                  .order_by(StockItem.name))).scalars()
    return [_item_dict(i) for i in rows]


@router.post("/stock/items", status_code=201)
async def add_stock_item(body: StockItemIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    if body.category not in cost.STOCK_CATEGORIES:
        raise Invalid(f"stock category must be one of {', '.join(cost.STOCK_CATEGORIES)}")
    if (await session.execute(select(StockItem).where(StockItem.farm_id == farm.id,
                                                      StockItem.name == body.name.strip()))).scalar_one_or_none():
        raise Conflict(f"{body.name!r} is already in stock")
    i = StockItem(farm_id=farm.id, name=body.name.strip(), category=body.category, unit=body.unit.strip())
    session.add(i)
    await session.commit()
    return _item_dict(i)


@router.post("/stock/items/{item_id}/in")
async def stock_in(item_id: str, body: StockInIn, farm: Farm = Depends(farm_dep),
                   session: AsyncSession = Depends(get_db)):
    """Buy stock. This is not a cost yet: the cost is counted when the stock is used."""
    i = await _own_item(session, farm, item_id)
    st = await farm_settings(session, farm)
    unit_cost = cost.to_usd(body.unit_price, body.currency, _num(st.khr_per_usd))
    i.qty_on_hand, i.avg_unit_cost_usd = cost.stock_in(float(i.qty_on_hand), float(i.avg_unit_cost_usd),
                                                       body.qty, unit_cost)
    session.add(StockMove(item_id=i.id, move_date=body.move_date, kind="in", qty=body.qty, unit_cost_usd=unit_cost))
    await session.commit()
    return _item_dict(i)


@router.post("/stock/items/{item_id}/use", status_code=201)
async def stock_use(item_id: str, body: StockUseIn, farm: Farm = Depends(farm_dep),
                    session: AsyncSession = Depends(get_db)):
    """Use stock on a cycle. This is where the cost is counted, at the moving-average price."""
    i = await _own_item(session, farm, item_id)
    if not body.planting_id:
        raise Invalid("say which cycle the stock was used on")
    planting = (await load_cycle(session, farm, body.planting_id))[0]
    avg = float(i.avg_unit_cost_usd)
    new_qty, used_cost = cost.stock_out(float(i.qty_on_hand), avg, body.qty)
    i.qty_on_hand = new_qty
    move = StockMove(item_id=i.id, move_date=body.move_date, kind="out", qty=body.qty, unit_cost_usd=avg,
                     planting_id=planting.id)
    session.add(move)
    await session.flush()
    entry = CostEntry(farm_id=farm.id, planting_id=planting.id, entry_date=body.move_date, category=i.category,
                      description=f"{i.name} ({body.qty:g} {i.unit})", qty=body.qty, unit=i.unit, unit_price=avg,
                      amount=round(used_cost, 2), currency="USD", amount_usd=round(used_cost, 2),
                      source="stock_use", stock_move_id=move.id)
    session.add(entry)
    await session.commit()
    return {"item": _item_dict(i), "move": {"id": str(move.id)}, "costEntry": _entry_dict(entry)}


@router.get("/stock/items/{item_id}/moves")
async def stock_moves(item_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    i = await _own_item(session, farm, item_id)
    rows = (await session.execute(select(StockMove).where(StockMove.item_id == i.id)
                                  .order_by(StockMove.move_date.desc(), StockMove.created_at.desc()))).scalars()
    return [{"id": str(m.id), "date": m.move_date.isoformat(), "kind": m.kind, "qty": float(m.qty),
             "unitCostUsd": round(float(m.unit_cost_usd), 4),
             "plantingId": str(m.planting_id) if m.planting_id else None} for m in rows]


@router.delete("/stock/moves/{move_id}", status_code=204)
async def undo_stock_use(move_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    """Undo a stock use: the quantity goes back and the cost entry it made is hidden."""
    m = await session.get(StockMove, as_uuid(move_id, "stock move"))
    item = await session.get(StockItem, m.item_id) if m else None
    if m is None or item is None or item.farm_id != farm.id:
        raise NotFound("stock move not found")
    if m.kind != "out":
        raise Conflict("a purchase cannot be removed; only a use can be undone")
    item.qty_on_hand, item.avg_unit_cost_usd = cost.stock_in(float(item.qty_on_hand), float(item.avg_unit_cost_usd),
                                                             float(m.qty), float(m.unit_cost_usd))
    now = datetime.now(timezone.utc)
    for e in (await session.execute(select(CostEntry).where(CostEntry.stock_move_id == m.id))).scalars():
        e.deleted_at = now
    await session.delete(m)
    await session.commit()
    return Response(status_code=204)


# ----------------------------------------------------------------- assets

class AssetIn(_Camel):
    name: str = Field(min_length=1, max_length=80)
    cost_usd: float = Field(ge=0)
    bought_on: date
    life_years: float = Field(gt=0, le=100)
    salvage_usd: float = Field(0, ge=0)


class RetireIn(_Camel):
    retired_on: date | None = None


def _asset_dict(a: Asset, today: date) -> dict:
    ai = cost.AssetIn(float(a.cost_usd), float(a.salvage_usd), float(a.life_years), a.bought_on, a.retired_on)
    if a.retired_on is not None and a.retired_on <= today:
        status = "retired"
    elif not cost.asset_in_service(ai, today) and today >= a.bought_on:
        status = "worn_out"
    else:
        status = "in_service"
    return {"id": str(a.id), "name": a.name, "costUsd": float(a.cost_usd), "boughtOn": a.bought_on.isoformat(),
            "lifeYears": float(a.life_years), "salvageUsd": float(a.salvage_usd),
            "retiredOn": a.retired_on.isoformat() if a.retired_on else None,
            "dailyDepreciationUsd": round(cost.depreciation_per_day(ai), 4), "status": status}


async def _own_asset(session: AsyncSession, farm: Farm, asset_id: str) -> Asset:
    a = await session.get(Asset, as_uuid(asset_id, "asset"))
    if a is None or a.farm_id != farm.id or a.deleted_at is not None:
        raise NotFound("asset not found")
    return a


@router.get("/assets")
async def list_assets(farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(Asset).where(Asset.farm_id == farm.id, Asset.deleted_at.is_(None))
                                  .order_by(Asset.bought_on.desc()))).scalars()
    today = farm_today()
    return [_asset_dict(a, today) for a in rows]


@router.post("/assets", status_code=201)
async def add_asset(body: AssetIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    if body.salvage_usd > body.cost_usd:
        raise Invalid("the scrap value cannot be more than the price paid")
    a = Asset(farm_id=farm.id, name=body.name.strip(), cost_usd=body.cost_usd, bought_on=body.bought_on,
              life_years=body.life_years, salvage_usd=body.salvage_usd)
    session.add(a)
    await session.commit()
    return _asset_dict(a, farm_today())


@router.patch("/assets/{asset_id}/retire")
async def retire_asset(asset_id: str, body: RetireIn, farm: Farm = Depends(farm_dep),
                       session: AsyncSession = Depends(get_db)):
    a = await _own_asset(session, farm, asset_id)
    a.retired_on = body.retired_on or farm_today()
    await session.commit()
    return _asset_dict(a, farm_today())


@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    a = await _own_asset(session, farm, asset_id)
    a.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return Response(status_code=204)
