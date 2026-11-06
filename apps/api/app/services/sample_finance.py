"""Sample costs, harvests and sales, so the Finance screens can be shown before a farm has real figures.

Every price and rate here is made up for a demo: none is a quote or a measured cost. Tree counts, cycle days, feed doses and
fruit prices come from the blocks themselves, so the figures are in proportion. Each row carries `sample`, and removing
them deletes those rows and nothing else. They cannot be loaded over real figures, which would mix the two in every total.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CostEntry, Farm, Harvest, Planting, Sale, Zone
from app.services import advisor, guava
from app.services.clock import farm_today
from app.services.errors import Conflict

WORKER_PER_DAY = 10.0           # sample wage, USD a day
NUTRIENT_PER_KG = 2.5           # sample price of N, P and K in feed, USD a kg
PUMP_PER_TREE_PER_10_DAYS = 0.08
BAGS_PER_TREE, BAG_PRICE = 40, 0.03
OVERHEAD_EVERY_DAYS, OVERHEAD = 30, 15.0
PICK_DAYS = (148, 155, 162)     # pickings in the harvest window, kg as a share of the setup's yearly yield per tree
PICK_SHARE = 0.12
TO_SELL, TO_HOME = 0.88, 0.04
DEFAULT_PRICE = 1.0


@dataclass(frozen=True)
class Line:
    day: int
    category: str
    description: str
    qty: float
    unit: str
    price: float

    @property
    def amount(self) -> float:
        return round(self.qty * self.price, 2)


def cost_lines(today_day: int, trees: int, setup: guava.Setup | None) -> list[Line]:
    """One block's sample costs up to its cycle day."""
    jobs = [(3, "Pruning", 0.10), (47, "Priming irrigations", 0.03), (62, "Pinching new shoots", 0.08), (108, "Bagging fruit", 0.15), (149, "Picking", 0.10)]
    out = [Line(day, "labour_hired", f"Sample: {name}", round(per_tree * trees, 2), "day", WORKER_PER_DAY) for day, name, per_tree in jobs]
    out += [Line(day, "water_energy", "Sample: pump fuel", trees, "tree", PUMP_PER_TREE_PER_10_DAYS) for day in range(46, guava.CYCLE_DAYS + 1, 10)]
    out.append(Line(108, "materials", "Sample: fruit bags", trees * BAGS_PER_TREE, "bag", BAG_PRICE))
    for day in range(46, guava.CYCLE_DAYS + 1):
        stage = guava.stage_of(day)
        if not advisor.feed_due(stage, day)[0]:
            continue
        dose = advisor.feed_dose(stage, setup, trees)
        if dose and sum(dose["total"].values()):
            out.append(Line(day, "fertilizer", f"Sample: feed for {stage.short.lower()}", round(sum(dose["total"].values()) / 1000, 3), "kg", NUTRIENT_PER_KG))
    return [line for line in out if line.day <= today_day and line.amount > 0]


def picks(today_day: int, trees: int, setup: guava.Setup | None) -> list[tuple[int, float, float, float]]:
    """(cycle day, kg picked, kg to sell, kg kept at home) for the pickings a block has reached."""
    if setup is None:
        return []
    per_tree = sum(setup.kg_per_tree) / 2
    kg = round(per_tree * trees * PICK_SHARE, 1)
    return [(day, kg, round(kg * TO_SELL, 1), round(kg * TO_HOME, 1)) for day in PICK_DAYS if day <= today_day]


def _farm_plantings(farm: Farm):
    return select(Planting.id).join(Zone, Planting.zone_id == Zone.id).where(Zone.farm_id == farm.id)


async def status(session: AsyncSession, farm: Farm) -> dict:
    planting_ids = _farm_plantings(farm)

    async def counts(model, *where) -> tuple[int, int]:
        rows = dict((await session.execute(select(model.sample, func.count()).where(*where).group_by(model.sample))).tuples().all())
        return rows.get(True, 0), rows.get(False, 0)
    costs = await counts(CostEntry, CostEntry.farm_id == farm.id, CostEntry.deleted_at.is_(None))
    harvests = await counts(Harvest, Harvest.planting_id.in_(planting_ids))
    sales = await counts(Sale, Sale.planting_id.in_(planting_ids))
    return {"sample": costs[0] + harvests[0] + sales[0], "real": costs[1] + harvests[1] + sales[1]}


async def load(session: AsyncSession, farm: Farm, today: date | None = None) -> dict:
    today = today or farm_today()
    now = await status(session, farm)
    if now["sample"]:
        raise Conflict("the sample figures are already loaded")
    if now["real"]:
        raise Conflict("this farm has real figures: sample figures would be mixed into every total")
    plantings = (await session.execute(select(Planting).join(Zone, Planting.zone_id == Zone.id).where(Zone.farm_id == farm.id, Planting.ended_on.is_(None)))).scalars().all()
    for p in plantings:
        trees = p.plant_count or 0
        setup = guava.SETUP_BY_ID.get(p.setup or "")
        day = guava.days_between(p.planted_on, today)
        on = lambda d: p.planted_on + timedelta(days=d - 1)  # noqa: E731, B023
        for line in cost_lines(day, trees, setup):
            session.add(CostEntry(farm_id=farm.id, planting_id=p.id, entry_date=on(line.day), category=line.category, description=line.description, qty=line.qty,
                                  unit=line.unit, unit_price=line.price, amount=line.amount, currency="USD", amount_usd=line.amount, sample=True))
        price = float(p.expected_price_usd_per_kg or DEFAULT_PRICE)
        for pick_day, kg, to_sell, home in picks(day, trees, setup):
            session.add(Harvest(planting_id=p.id, harvest_date=on(pick_day), kg_total=kg, kg_marketable=to_sell, kg_home=home, note="Sample", sample=True))
            session.add(Sale(planting_id=p.id, sale_date=on(pick_day), kg=to_sell, price_per_kg=price, currency="USD", amount_usd=round(to_sell * price, 2), buyer="Sample buyer", sample=True))
    start = min((p.planted_on for p in plantings), default=today)
    for offset in range(0, max(0, (today - start).days) + 1, OVERHEAD_EVERY_DAYS):
        session.add(CostEntry(farm_id=farm.id, planting_id=None, entry_date=start + timedelta(days=offset), category="overhead", description="Sample: phone, transport, small tools",
                              qty=1, unit="month", unit_price=OVERHEAD, amount=OVERHEAD, currency="USD", amount_usd=OVERHEAD, sample=True))
    await session.commit()
    return await status(session, farm)


async def remove(session: AsyncSession, farm: Farm) -> dict:
    """Delete the sample rows, and only those."""
    planting_ids = _farm_plantings(farm)
    await session.execute(delete(CostEntry).where(CostEntry.farm_id == farm.id, CostEntry.sample.is_(True)))
    await session.execute(delete(Harvest).where(Harvest.planting_id.in_(planting_ids), Harvest.sample.is_(True)))
    await session.execute(delete(Sale).where(Sale.planting_id.in_(planting_ids), Sale.sample.is_(True)))
    await session.commit()
    return await status(session, farm)
