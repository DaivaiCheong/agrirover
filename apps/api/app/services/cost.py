"""Cost of production (COP): pure functions, no database.

    COP per kg = total cost of the crop cycle / marketable kg harvested

What goes into a cycle's cost:
  * entries tied to the cycle (seed, fertilizer, labour, services, ...)
  * a share of farm-level entries (overhead), split by area across the cycles growing that day
  * a share of equipment depreciation, straight line, split the same way
  * land rent: rent per ha per year x the cycle's hectares x days / 365
  * water: real entries if there are any, otherwise the planner's m3 x the water price,
    marked as an ESTIMATE

Missing inputs are reported in `flags`, never guessed. A stock purchase is not a cost; using the
stock is (the moving-average price), so nothing is counted twice.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.services.errors import Invalid

# Entered by the farmer. Depreciation and land are computed, so they are not here.
CATEGORIES = ("seed", "fertilizer", "pesticide", "materials", "water_energy", "labour_hired", "labour_family",
              "services", "repairs", "interest", "overhead", "other")
STOCK_CATEGORIES = ("seed", "fertilizer", "pesticide", "materials")
CATEGORY_LABELS = {
    "seed": "Seeds and seedlings", "fertilizer": "Fertilizer", "pesticide": "Pesticide", "materials": "Materials",
    "water_energy": "Water and energy", "labour_hired": "Hired labour", "labour_family": "Family labour",
    "services": "Services", "repairs": "Repairs", "interest": "Interest", "overhead": "Overhead", "other": "Other",
    "depreciation": "Equipment depreciation", "land": "Land",
}
_REPORT_ORDER = CATEGORIES + ("depreciation", "land")


@dataclass(frozen=True)
class CycleIn:
    id: str
    start: date
    end: date | None            # None while the cycle is open
    area_m2: float | None
    plants: int | None


@dataclass(frozen=True)
class EntryIn:
    category: str
    amount_usd: float
    day: date
    cycle_id: str | None        # None = a farm-level entry


@dataclass(frozen=True)
class AssetIn:
    cost_usd: float
    salvage_usd: float
    life_years: float
    bought_on: date
    retired_on: date | None = None


@dataclass(frozen=True)
class HarvestIn:
    kg_total: float
    kg_marketable: float
    kg_home: float


@dataclass(frozen=True)
class SaleIn:
    kg: float
    amount_usd: float


@dataclass(frozen=True)
class CopLine:
    category: str
    amount_usd: float
    estimate: bool = False


@dataclass(frozen=True)
class CopReport:
    lines: list[CopLine]
    total_cost_usd: float
    days: int
    open: bool
    kg_total: float
    kg_marketable: float
    kg_home: float
    kg_lost: float
    revenue_usd: float
    margin_usd: float | None
    cop_per_kg: float | None
    cost_per_plant: float | None
    cost_per_m2: float | None
    kg_per_m3_water: float | None
    flags: list[str] = field(default_factory=list)


# ------------------------------------------------------------------ money

def to_usd(amount: float, currency: str, khr_per_usd: float | None) -> float:
    if currency == "USD":
        return amount
    if currency == "KHR":
        if not khr_per_usd:
            raise Invalid("set the exchange rate in Settings before entering riel")
        return amount / khr_per_usd
    raise Invalid(f"unknown currency {currency!r}; use USD or KHR")


# ------------------------------------------------------------------ stock

def stock_in(qty_on_hand: float, avg_cost: float, qty: float, unit_cost: float) -> tuple[float, float]:
    """New (quantity, moving-average unit cost) after buying `qty` at `unit_cost`."""
    if qty <= 0:
        raise Invalid("quantity must be above 0")
    new_qty = qty_on_hand + qty
    return new_qty, (qty_on_hand * avg_cost + qty * unit_cost) / new_qty


def stock_out(qty_on_hand: float, avg_cost: float, qty: float) -> tuple[float, float]:
    """(new quantity, cost of what was used). Refuses to use more than is on hand."""
    if qty <= 0:
        raise Invalid("quantity must be above 0")
    if qty > qty_on_hand + 1e-9:
        raise Invalid(f"not enough in stock: {qty_on_hand:g} on hand")
    return qty_on_hand - qty, qty * avg_cost


# ------------------------------------------------------------ depreciation

def depreciation_per_day(a: AssetIn) -> float:
    return (a.cost_usd - a.salvage_usd) / (a.life_years * 365)


def asset_in_service(a: AssetIn, day: date) -> bool:
    if day < a.bought_on or (a.retired_on is not None and day >= a.retired_on):
        return False
    return (day - a.bought_on).days < a.life_years * 365            # fully depreciated after its life


# ------------------------------------------------------------- time and shares

def _last_day(c: CycleIn, today: date) -> date:
    return min(c.end, today) if c.end else today


def cycle_days(c: CycleIn, today: date) -> int:
    return max(0, (_last_day(c, today) - c.start).days + 1)


def _active(c: CycleIn, day: date, today: date) -> bool:
    return c.start <= day <= _last_day(c, today)


def shares_on(day: date, cycles: list[CycleIn], today: date) -> dict[str, float]:
    """How a shared cost of one day is split: by area across the cycles growing that day
    (equally if any of them has no area)."""
    active = [c for c in cycles if _active(c, day, today)]
    if not active:
        return {}
    by_area = all(c.area_m2 for c in active)
    weights = {c.id: (c.area_m2 if by_area else 1.0) for c in active}
    total = sum(weights.values())
    return {cid: w / total for cid, w in weights.items()}


def _days(c: CycleIn, today: date):
    d = c.start
    last = _last_day(c, today)
    while d <= last:
        yield d
        d += timedelta(days=1)


def depreciation_for_cycle(c: CycleIn, cycles: list[CycleIn], assets: list[AssetIn], today: date) -> float:
    total = 0.0
    for day in _days(c, today):
        share = shares_on(day, cycles, today).get(c.id, 0.0)
        total += share * sum(depreciation_per_day(a) for a in assets if asset_in_service(a, day))
    return total


def allocated_farm_costs(c: CycleIn, cycles: list[CycleIn], farm_entries: list[EntryIn],
                         today: date) -> dict[str, float]:
    """The cycle's share of farm-level entries, by category. An entry dated when no cycle was
    growing belongs to nobody."""
    out: dict[str, float] = {}
    for e in farm_entries:
        share = shares_on(e.day, cycles, today).get(c.id, 0.0)
        if share:
            out[e.category] = out.get(e.category, 0.0) + e.amount_usd * share
    return out


def land_cost(c: CycleIn, rent_per_ha_year: float | None, today: date) -> float | None:
    if rent_per_ha_year is None or not c.area_m2:
        return None
    return rent_per_ha_year * (c.area_m2 / 10_000) * cycle_days(c, today) / 365


# --------------------------------------------------------------------- COP

def compute_cop(c: CycleIn, *, cycles: list[CycleIn], entries: list[EntryIn], assets: list[AssetIn],
                harvests: list[HarvestIn], sales: list[SaleIn], today: date,
                land_rent_per_ha_year: float | None = None, water_cost_per_m3: float | None = None,
                water_m3: float | None = None) -> CopReport:
    flags: list[str] = []
    sums: dict[str, float] = {}
    for e in entries:
        if e.cycle_id == c.id:
            sums[e.category] = sums.get(e.category, 0.0) + e.amount_usd
    farm_level = [e for e in entries if e.cycle_id is None]
    for cat, amount in allocated_farm_costs(c, cycles, farm_level, today).items():
        sums[cat] = sums.get(cat, 0.0) + amount

    estimate: set[str] = set()
    if "water_energy" not in sums:
        if water_cost_per_m3 is not None and water_m3 is not None:
            sums["water_energy"] = water_m3 * water_cost_per_m3
            estimate.add("water_energy")
            flags.append("water cost is an estimate: planner m3 x your water price")
        else:
            flags.append("water cost not included: enter it, or set the water price in Settings")

    if assets:
        sums["depreciation"] = depreciation_for_cycle(c, cycles, assets, today)
    land = land_cost(c, land_rent_per_ha_year, today)
    if land is not None:
        sums["land"] = land
    else:
        flags.append("land cost not included: set the land rent in Settings and the cycle area")

    lines = [CopLine(cat, sums[cat], cat in estimate) for cat in _REPORT_ORDER if cat in sums]
    total = sum(x.amount_usd for x in lines)

    kg_total = sum(h.kg_total for h in harvests)
    kg_marketable = sum(h.kg_marketable for h in harvests)
    kg_home = sum(h.kg_home for h in harvests)
    revenue = sum(s.amount_usd for s in sales)

    if kg_marketable <= 0:
        flags.append("no harvest recorded yet, so there is no cost per kg")
    if c.end is None:
        flags.append("cycle is still open: costs so far")
    if not c.plants:
        flags.append("no plant count: cost per plant is not shown")
    if not c.area_m2:
        flags.append("no area: cost per m2 is not shown")

    return CopReport(
        lines=lines, total_cost_usd=total, days=cycle_days(c, today), open=c.end is None,
        kg_total=kg_total, kg_marketable=kg_marketable, kg_home=kg_home,
        kg_lost=max(0.0, kg_total - kg_marketable - kg_home), revenue_usd=revenue,
        margin_usd=(revenue - total) if sales else None,
        cop_per_kg=total / kg_marketable if kg_marketable > 0 else None,
        cost_per_plant=total / c.plants if c.plants else None,
        cost_per_m2=total / c.area_m2 if c.area_m2 else None,
        kg_per_m3_water=kg_marketable / water_m3 if water_m3 and kg_marketable > 0 else None,
        flags=flags)
