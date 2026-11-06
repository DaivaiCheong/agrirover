"""Sample finance figures: in proportion to the block, always marked, never mixed with or removed from real ones."""
from datetime import date

import pgdb
from sqlalchemy import select

from app.models.entities import CostEntry, Farm, Harvest, Planting, Sale
from app.services import guava, sample_finance as sf
from app.services.seed import seed_stage1

B = guava.SETUP_BY_ID["commercial"]


class TestFigures:
    def test_only_what_the_cycle_has_reached(self):
        days = [line.day for line in sf.cost_lines(30, 10, B)]
        assert days == [3] and sf.picks(30, 10, B) == []

    def test_feed_appears_only_after_stress(self):
        assert not [x for x in sf.cost_lines(45, 10, B) if x.category == "fertilizer"]
        assert [x for x in sf.cost_lines(60, 10, B) if x.category == "fertilizer"]

    def test_costs_scale_with_the_trees(self):
        small = sum(x.amount for x in sf.cost_lines(170, 10, B))
        large = sum(x.amount for x in sf.cost_lines(170, 20, B))
        assert abs(large - 2 * small) < 0.5

    def test_every_cost_says_sample_and_has_a_real_category(self):
        from app.services.cost import CATEGORIES
        assert all(x.description.startswith("Sample:") and x.category in CATEGORIES and x.amount > 0 for x in sf.cost_lines(170, 10, B))

    def test_a_picking_adds_up_and_comes_from_the_setups_yield(self):
        picks = sf.picks(165, 10, B)
        assert [p[0] for p in picks] == list(sf.PICK_DAYS)
        day, kg, to_sell, home = picks[0]
        assert to_sell + home <= kg and kg == round(32.5 * 10 * sf.PICK_SHARE, 1)
        assert sf.picks(165, 10, None) == []


@pgdb.with_db("aaf_sample_finance")
async def test_loading_marks_everything_and_removing_leaves_real_entries(Session):
    async with Session() as s:
        await seed_stage1(s)
    today = date(2026, 11, 5)
    async with Session() as s:
        farm = await s.scalar(select(Farm))
        assert await sf.status(s, farm) == {"sample": 0, "real": 0}
        made = await sf.load(s, farm, today)
    assert made["sample"] > 0 and made["real"] == 0

    async with pgdb.api(Session) as c:
        assert (await c.get("/api/v1/finance/sample")).json()["sample"] == made["sample"]
        assert (await c.post("/api/v1/finance/sample")).status_code == 409                      # not twice
        costs = (await c.get("/api/v1/costs")).json()
        assert costs and all(x["sample"] and x["description"].startswith("Sample") for x in costs)
        cycles = (await c.get("/api/v1/cycles")).json()
        harvested = 0
        for cycle in cycles:
            harvests = (await c.get(f"/api/v1/cycles/{cycle['id']}/harvests")).json()
            sales = (await c.get(f"/api/v1/cycles/{cycle['id']}/sales")).json()
            assert all(h["sample"] for h in harvests) and all(x["sample"] and x["buyer"] == "Sample buyer" for x in sales) and len(harvests) == len(sales)
            harvested += len(harvests)
        assert harvested > 0
        assert "includes sample figures" in (await c.get("/api/v1/export/cop.csv")).text

        # a real entry, then remove the samples: the real one stays
        plantings = cycles[0]["id"]
        real_cost = await c.post("/api/v1/costs", json={"plantingId": plantings, "date": "2026-11-01", "category": "fertilizer", "amount": 12.5})
        real_harvest = await c.post(f"/api/v1/cycles/{plantings}/harvests", json={"date": "2026-11-01", "kgTotal": 5, "kgMarketable": 4})
        real_sale = await c.post(f"/api/v1/cycles/{plantings}/sales", json={"date": "2026-11-01", "kg": 4, "pricePerKg": 1})
        assert real_cost.status_code == real_harvest.status_code == real_sale.status_code == 201
        assert real_cost.json()["sample"] is False and real_harvest.json()["sample"] is False and real_sale.json()["sample"] is False

        after = (await c.delete("/api/v1/finance/sample")).json()
        assert after == {"sample": 0, "real": 3}
        left = (await c.get("/api/v1/costs")).json()
        assert [x["id"] for x in left] == [real_cost.json()["id"]]
        assert "includes sample figures" not in (await c.get("/api/v1/export/cop.csv")).text

        # now the farm has real figures, samples are refused
        refused = await c.post("/api/v1/finance/sample")
        assert refused.status_code == 409 and "real figures" in refused.json()["detail"]

    async with Session() as s:
        assert len((await s.scalars(select(Harvest))).all()) == 1 and len((await s.scalars(select(Sale))).all()) == 1
        assert len((await s.scalars(select(CostEntry))).all()) == 1 and (await s.scalars(select(Planting))).first() is not None
