"""Gathers a cycle's data from the database and runs the pure COP engine (services/cost.py)."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Asset, CostEntry, Farm, Harvest, Planting, Sale, Zone
from datetime import timedelta

from app.services import advisor, climate, cost, guava
from app.services.farm_data import cycle_dict, farm_settings, load_cycle


def _num(v):
    return None if v is None else float(v)


async def farm_cycles(session: AsyncSession, farm: Farm) -> list[cost.CycleIn]:
    rows = (await session.execute(
        select(Planting).join(Zone, Planting.zone_id == Zone.id).where(Zone.farm_id == farm.id))).scalars().all()
    return [cost.CycleIn(str(p.id), p.planted_on, p.ended_on, _num(p.area_m2), p.plant_count) for p in rows]


async def farm_entries(session: AsyncSession, farm: Farm) -> list[cost.EntryIn]:
    rows = (await session.execute(select(CostEntry).where(
        CostEntry.farm_id == farm.id, CostEntry.deleted_at.is_(None)))).scalars().all()
    return [cost.EntryIn(e.category, float(e.amount_usd), e.entry_date,
                         str(e.planting_id) if e.planting_id else None) for e in rows]


async def build_cop(session: AsyncSession, farm: Farm, cycle_id: str, today: date) -> dict:
    p, zone, crop = await load_cycle(session, farm, cycle_id)
    st = await farm_settings(session, farm)
    cycles = await farm_cycles(session, farm)
    this = next(c for c in cycles if c.id == str(p.id))

    assets = [cost.AssetIn(float(a.cost_usd), float(a.salvage_usd), float(a.life_years), a.bought_on, a.retired_on)
              for a in (await session.execute(select(Asset).where(
                  Asset.farm_id == farm.id, Asset.deleted_at.is_(None)))).scalars()]
    harvests = [cost.HarvestIn(float(h.kg_total), float(h.kg_marketable), float(h.kg_home))
                for h in (await session.execute(select(Harvest).where(Harvest.planting_id == p.id))).scalars()]
    sales = [cost.SaleIn(float(s.kg), float(s.amount_usd))
             for s in (await session.execute(select(Sale).where(Sale.planting_id == p.id))).scalars()]

    # Water the trees would have used so far at full stage demand (an estimate, not a meter)
    water_m3 = None
    if p.plant_count and p.area_m2:
        per_tree = float(p.area_m2) / p.plant_count
        days = min(cost.cycle_days(this, today), guava.CYCLE_DAYS)
        litres = sum(advisor.full_demand_litres(guava.stage_of(d), climate.et0_on(p.planted_on + timedelta(days=d - 1)), per_tree,
                                                float(st.irrigation_efficiency), p.regulation == "withhold") for d in range(1, days + 1))
        water_m3 = litres * p.plant_count / 1000

    report = cost.compute_cop(
        this, cycles=cycles, entries=await farm_entries(session, farm), assets=assets, harvests=harvests,
        sales=sales, today=today, land_rent_per_ha_year=_num(st.land_rent_usd_per_ha_year),
        water_cost_per_m3=_num(st.water_cost_per_m3_usd), water_m3=water_m3)
    return cop_dict(report, cycle_dict(p, zone, crop, today), _num(st.khr_per_usd), water_m3)


def _r(v, n=2):
    return None if v is None else round(v, n)


def cop_dict(r: cost.CopReport, cycle: dict, khr_per_usd: float | None, water_m3: float | None) -> dict:
    total = r.total_cost_usd
    fc = cycle.get("forecast")
    # What a kilo will cost if the crop reaches the setup's benchmark yield, at the costs recorded so far.
    cost_if = ({"atLowYield": round(total / fc["kgLow"], 3), "atHighYield": round(total / fc["kgHigh"], 3)}
               if fc and total > 0 and fc["kgLow"] > 0 else None)
    return {
        "cycle": cycle, "currency": "USD", "khrPerUsd": khr_per_usd, "costPerKgIfBenchmark": cost_if,
        "lines": [{"category": x.category, "label": cost.CATEGORY_LABELS[x.category],
                   "amountUsd": round(x.amount_usd, 2), "sharePct": round(100 * x.amount_usd / total, 2) if total else 0,
                   "estimate": x.estimate} for x in r.lines],
        "totalCostUsd": round(total, 2), "days": r.days, "open": r.open,
        "kgTotal": _r(r.kg_total), "kgMarketable": _r(r.kg_marketable), "kgHome": _r(r.kg_home),
        "kgLost": _r(r.kg_lost), "revenueUsd": _r(r.revenue_usd), "marginUsd": _r(r.margin_usd),
        "copPerKg": _r(r.cop_per_kg, 3), "breakEvenPricePerKg": _r(r.cop_per_kg, 3),
        "costPerPlant": _r(r.cost_per_plant, 3), "costPerM2": _r(r.cost_per_m2, 3),
        "kgPerM3Water": _r(r.kg_per_m3_water, 1), "waterM3": _r(water_m3, 3), "flags": r.flags,
    }
