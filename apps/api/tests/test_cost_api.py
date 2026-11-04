"""M2 through the real API: costs, stock, equipment, harvest, sales, and the COP report.

The worked example matches tests/test_cop.py, except water: here the planner supplies it.
Tomato, 100 plants on 50 m2 (0.5 m2 each), ET0 4.5, efficiency 0.9, Kc 0.6 in the first 10 days:
  litres/day = 0.6 x 4.5 x 0.5 / 0.9 x 100 = 150  ->  10 days = 1.5 m3  x 0.10 USD = 0.15
  total = 286 + depreciation 10 + land 0.05 + water 0.15 = 296.20      COP = 2.962 per kg."""
import csv
import io

import pgdb
import pytest

from app.services.seed import seed_stage1

V1 = "/api/v1"
TODAY = {"today": "2026-01-10"}


async def seeded(Session):
    async with Session() as s:
        await seed_stage1(s)


async def farm_with_cycle(c, label="Test bed", planted="2026-01-01", closed="2026-01-10", area=50, plants=100):
    assert (await c.put(f"{V1}/farm/settings", json={
        "khrPerUsd": 4000, "familyWageUsdPerDay": 6, "waterCostPerM3Usd": 0.1, "landRentUsdPerHaYear": 365,
        "et0MmDay": 4.5, "irrigationEfficiency": 0.9})).status_code == 200
    bed = (await c.post(f"{V1}/zones", json={"label": label, "areaM2": area})).json()
    cyc = (await c.post(f"{V1}/cycles", json={"zone": bed["name"], "crop": "tomato", "plantedOn": planted,
                                              "plantCount": plants, "areaM2": area})).json()
    if closed:
        assert (await c.post(f"{V1}/cycles/{cyc['id']}/close", json={"endedOn": closed})).status_code == 200
    return cyc["id"]


async def add_cost(c, cycle_id, category, **kw):
    body = {"plantingId": cycle_id, "date": "2026-01-05", "category": category, **kw}
    r = await c.post(f"{V1}/costs", json=body)
    assert r.status_code == 201, r.text
    return r.json()


@pgdb.with_db("aaf_m2_flow")
async def test_cost_of_production_end_to_end(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        cid = await farm_with_cycle(c)
        await add_cost(c, cid, "seed", amount=8)
        await add_cost(c, cid, "fertilizer", amount=40)
        await add_cost(c, cid, "pesticide", amount=25)
        await add_cost(c, cid, "labour_hired", qty=6, unit="day", unitPrice=8)                # 48
        await add_cost(c, cid, "labour_family", qty=20, unit="day")                           # 20 x 6 (the family wage) = 120
        await add_cost(c, cid, "services", amount=60000, currency="KHR")                      # 60000 / 4000 = 15
        await add_cost(c, cid, "materials", amount=30)
        assert (await c.post(f"{V1}/assets", json={"name": "Pump", "costUsd": 3650, "boughtOn": "2025-01-01",
                                                   "lifeYears": 10, "salvageUsd": 0})).status_code == 201
        assert (await c.post(f"{V1}/cycles/{cid}/harvests", json={
            "date": "2026-01-09", "kgTotal": 120, "kgMarketable": 100, "kgHome": 10})).status_code == 201
        assert (await c.post(f"{V1}/cycles/{cid}/sales", json={
            "date": "2026-01-10", "kg": 80, "pricePerKg": 4, "currency": "USD", "buyer": "market"})).status_code == 201

        r = await c.get(f"{V1}/cycles/{cid}/cop", params=TODAY)
        assert r.status_code == 200
        cop = r.json()
        by = {x["category"]: x for x in cop["lines"]}
        assert by["labour_family"]["amountUsd"] == 120 and by["services"]["amountUsd"] == 15
        assert by["depreciation"]["amountUsd"] == pytest.approx(10.0)
        assert by["land"]["amountUsd"] == pytest.approx(0.05)
        assert by["water_energy"]["amountUsd"] == pytest.approx(0.15, abs=0.006) and by["water_energy"]["estimate"]
        assert cop["totalCostUsd"] == pytest.approx(296.20, abs=0.01)
        assert cop["copPerKg"] == pytest.approx(2.962, abs=0.001)
        assert cop["costPerPlant"] == pytest.approx(2.962, abs=0.001) and cop["costPerM2"] == pytest.approx(5.924, abs=0.001)
        assert cop["kgMarketable"] == 100 and cop["kgLost"] == 10
        assert cop["revenueUsd"] == 320 and cop["marginUsd"] == pytest.approx(23.8, abs=0.01)
        assert cop["breakEvenPricePerKg"] == cop["copPerKg"]
        assert abs(sum(x["sharePct"] for x in cop["lines"]) - 100) < 0.2
        assert cop["cycle"]["bedLabel"] == "Test bed"


@pgdb.with_db("aaf_m2_costs")
async def test_cost_entries_validate_edit_and_soft_delete(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        cid = await farm_with_cycle(c)
        base = {"plantingId": cid, "date": "2026-01-05", "category": "seed"}
        for bad in ({"category": "yacht", "amount": 5}, {"amount": -1}, {}, {"qty": 3},          # no price at all
                    {"amount": 5, "currency": "EUR"}, {"amount": 5, "plantingId": "not-a-cycle"}):
            assert (await c.post(f"{V1}/costs", json={**base, **bad})).status_code in (404, 422), bad
        await c.put(f"{V1}/farm/settings", json={"khrPerUsd": 4000})
        entry = await add_cost(c, cid, "services", amount=60000, currency="KHR")
        assert entry["amountUsd"] == 15 and entry["rateUsed"] == 4000

        # the rate is frozen on the day the entry was made
        await c.put(f"{V1}/farm/settings", json={"khrPerUsd": 5000})
        listed = (await c.get(f"{V1}/costs", params={"cycle": cid})).json()
        assert listed[0]["amountUsd"] == 15

        r = await c.patch(f"{V1}/costs/{entry['id']}", json={"amount": 20000})
        assert r.status_code == 200 and r.json()["amountUsd"] == 4                         # 20000 / 5000, the current rate

        assert (await c.delete(f"{V1}/costs/{entry['id']}")).status_code == 204
        assert (await c.get(f"{V1}/costs", params={"cycle": cid})).json() == []             # hidden, not erased
        assert (await c.delete(f"{V1}/costs/{entry['id']}")).status_code == 404


@pgdb.with_db("aaf_m2_nofamilywage")
async def test_family_labour_needs_a_wage(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        bed = (await c.post(f"{V1}/zones", json={"label": "B1"})).json()
        cyc = (await c.post(f"{V1}/cycles", json={"zone": bed["name"], "crop": "tomato", "plantedOn": "2026-01-01"})).json()
        r = await c.post(f"{V1}/costs", json={"plantingId": cyc["id"], "date": "2026-01-02",
                                              "category": "labour_family", "qty": 2, "unit": "day"})
        assert r.status_code == 422 and "family wage" in r.json()["detail"].lower()


@pgdb.with_db("aaf_m2_stock")
async def test_stock_buys_do_not_cost_but_use_does(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        cid = await farm_with_cycle(c)
        item = (await c.post(f"{V1}/stock/items", json={"name": "Urea", "category": "fertilizer", "unit": "kg"})).json()
        assert (await c.post(f"{V1}/stock/items", json={"name": "Urea", "category": "fertilizer", "unit": "kg"})).status_code == 409
        assert (await c.post(f"{V1}/stock/items", json={"name": "Gold", "category": "services", "unit": "kg"})).status_code == 422
        iid = item["id"]
        await c.post(f"{V1}/stock/items/{iid}/in", json={"date": "2026-01-02", "qty": 10, "unitPrice": 2})
        r = await c.post(f"{V1}/stock/items/{iid}/in", json={"date": "2026-01-03", "qty": 10, "unitPrice": 16000, "currency": "KHR"})
        assert r.json()["qtyOnHand"] == 20 and r.json()["avgUnitCostUsd"] == pytest.approx(3.0)   # (20 + 40) / 20

        # buying alone costs the cycle nothing
        assert (await c.get(f"{V1}/cycles/{cid}/cop", params=TODAY)).json()["totalCostUsd"] < 1   # land + water only

        used = await c.post(f"{V1}/stock/items/{iid}/use", json={"date": "2026-01-05", "qty": 5, "plantingId": cid})
        assert used.status_code == 201
        assert used.json()["item"]["qtyOnHand"] == 15 and used.json()["costEntry"]["amountUsd"] == 15
        assert used.json()["costEntry"]["category"] == "fertilizer" and used.json()["costEntry"]["source"] == "stock_use"
        by = {x["category"]: x["amountUsd"] for x in (await c.get(f"{V1}/cycles/{cid}/cop", params=TODAY)).json()["lines"]}
        assert by["fertilizer"] == 15

        assert (await c.post(f"{V1}/stock/items/{iid}/use", json={"date": "2026-01-06", "qty": 99, "plantingId": cid})).status_code == 422
        assert (await c.post(f"{V1}/stock/items/{iid}/use", json={"date": "2026-01-06", "qty": 1})).status_code == 422   # no cycle

        # the cost of a stock use is removed by undoing the use, not by deleting the entry
        assert (await c.delete(f"{V1}/costs/{used.json()['costEntry']['id']}")).status_code == 409
        assert (await c.delete(f"{V1}/stock/moves/{used.json()['move']['id']}")).status_code == 204
        back = [x for x in (await c.get(f"{V1}/stock/items")).json() if x["id"] == iid][0]
        assert back["qtyOnHand"] == 20 and back["valueUsd"] == pytest.approx(60.0)
        by = {x["category"]: x["amountUsd"] for x in (await c.get(f"{V1}/cycles/{cid}/cop", params=TODAY)).json()["lines"]}
        assert "fertilizer" not in by


@pgdb.with_db("aaf_m2_assets")
async def test_equipment_and_harvest_validation(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        cid = await farm_with_cycle(c)
        ok = {"name": "Tank", "costUsd": 300, "boughtOn": "2025-06-01", "lifeYears": 5, "salvageUsd": 0}
        made = await c.post(f"{V1}/assets", json=ok)
        assert made.status_code == 201 and made.json()["dailyDepreciationUsd"] == pytest.approx(300 / (5 * 365), abs=1e-4)
        for bad in ({"lifeYears": 0}, {"costUsd": -5}, {"salvageUsd": 400}):
            assert (await c.post(f"{V1}/assets", json={**ok, **bad})).status_code == 422
        rid = made.json()["id"]
        assert (await c.patch(f"{V1}/assets/{rid}/retire", json={"retiredOn": "2026-01-05"})).json()["status"] == "retired"
        assert (await c.delete(f"{V1}/assets/{rid}")).status_code == 204
        assert (await c.get(f"{V1}/assets")).json() == []

        for bad in ({"kgTotal": 10, "kgMarketable": 8, "kgHome": 5}, {"kgTotal": -1, "kgMarketable": 0},
                    {"kgTotal": 10, "kgMarketable": 11}):
            assert (await c.post(f"{V1}/cycles/{cid}/harvests", json={"date": "2026-01-09", **bad})).status_code == 422
        assert (await c.post(f"{V1}/cycles/{cid}/sales", json={"date": "2026-01-10", "kg": 0, "pricePerKg": 1})).status_code == 422
        h = (await c.post(f"{V1}/cycles/{cid}/harvests", json={"date": "2026-01-09", "kgTotal": 10, "kgMarketable": 8})).json()
        assert len((await c.get(f"{V1}/cycles/{cid}/harvests")).json()) == 1
        assert (await c.delete(f"{V1}/harvests/{h['id']}")).status_code == 204
        assert (await c.get(f"{V1}/cycles/{cid}/harvests")).json() == []


@pgdb.with_db("aaf_m2_compare")
async def test_compare_two_beds_and_export(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        a = await farm_with_cycle(c, label="Bed A2")
        b = (await c.post(f"{V1}/zones", json={"label": "Bed B2", "areaM2": 50})).json()
        cb = (await c.post(f"{V1}/cycles", json={"zone": b["name"], "crop": "tomato", "plantedOn": "2026-01-01",
                                                 "plantCount": 100, "areaM2": 50})).json()["id"]
        await c.post(f"{V1}/cycles/{cb}/close", json={"endedOn": "2026-01-10"})
        await add_cost(c, a, "seed", amount=10)
        await add_cost(c, cb, "seed", amount=20)
        for cid, kg in ((a, 100), (cb, 100)):
            await c.post(f"{V1}/cycles/{cid}/harvests", json={"date": "2026-01-09", "kgTotal": kg, "kgMarketable": kg})

        r = await c.get(f"{V1}/reports/compare", params={"a": a, "b": cb, **TODAY})
        assert r.status_code == 200
        body = r.json()
        assert body["a"]["cycle"]["bedLabel"] == "Bed A2" and body["b"]["cycle"]["bedLabel"] == "Bed B2"
        assert body["copPerKgDifference"] == pytest.approx(body["a"]["copPerKg"] - body["b"]["copPerKg"], abs=1e-3)
        assert body["copPerKgDifference"] == pytest.approx(-0.1, abs=0.001)               # 10 less spent on 100 kg
        assert (await c.get(f"{V1}/reports/compare", params={"a": a, "b": "nope"})).status_code == 404

        # CSV export: opens in Excel, and cannot run a formula a farmer typed
        await add_cost(c, a, "other", amount=1, description="=HYPERLINK(\"http://evil\")")
        resp = await c.get(f"{V1}/export/costs.csv")
        assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/csv")
        rows = list(csv.reader(io.StringIO(resp.text)))
        assert rows[0][:4] == ["date", "bed", "crop", "category"]
        assert any(r[3] == "seed" and r[9] == "10.00" for r in rows[1:])
        assert all(not cell.startswith("=") for row in rows for cell in row)
        cop_csv = list(csv.reader(io.StringIO((await c.get(f"{V1}/export/cop.csv", params=TODAY)).text)))
        assert cop_csv[0][0] == "bed" and any(r[0] == "Bed A2" for r in cop_csv[1:])
