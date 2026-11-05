"""M1: farm settings, beds and crop cycles.

These go through the real API against a throwaway Postgres (skipped when none is reachable)."""
import pgdb

from app.services.seed import seed_stage1

V1 = "/api/v1"


async def seeded(Session):
    async with Session() as s:
        await seed_stage1(s)


@pgdb.with_db("aaf_m1_settings")
async def test_settings_start_unconfirmed_and_are_saved(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        body = (await c.get(f"{V1}/farm/settings")).json()
        assert body["khrPerUsd"] == 4000 and body["rateConfirmed"] is False       # a placeholder until saved
        assert body["irrigationEfficiency"] == 0.9 and "et0MmDay" not in body    # ET0 now comes from Siem Reap's climate
        assert body["familyWageUsdPerDay"] is None and body["waterCostPerM3Usd"] is None
        assert body["landRentUsdPerHaYear"] is None                                # unset means unset, never a guess

        r = await c.put(f"{V1}/farm/settings", json={"khrPerUsd": 4100, "familyWageUsdPerDay": 6,
                                                      "waterCostPerM3Usd": 0.1, "landRentUsdPerHaYear": 200})
        assert r.status_code == 200 and r.json()["rateConfirmed"] is True
        again = (await c.get(f"{V1}/farm/settings")).json()
        assert again["khrPerUsd"] == 4100 and again["familyWageUsdPerDay"] == 6
        assert again["irrigationEfficiency"] == 0.9                                # not sent, so unchanged

        for bad in ({"khrPerUsd": 0}, {"irrigationEfficiency": 1.5}):
            assert (await c.put(f"{V1}/farm/settings", json=bad)).status_code == 422


@pgdb.with_db("aaf_m1_cycles")
async def test_beds_and_cycles(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        bed = await c.post(f"{V1}/zones", json={"label": "Chilli bed 1", "areaM2": 40})
        assert bed.status_code == 201 and bed.json()["name"] == "chilli-bed-1"
        assert (await c.post(f"{V1}/zones", json={"label": "Chilli bed 1"})).status_code == 409   # same name twice

        body = {"zone": "chilli-bed-1", "crop": "guava", "plantedOn": "2026-10-15",
                "plantCount": 80, "areaM2": 40, "variety": "local"}
        r = await c.post(f"{V1}/cycles", json=body)
        assert r.status_code == 201
        cycle = r.json()
        assert cycle["bedLabel"] == "Chilli bed 1" and cycle["cropName"] == "Guava" and cycle["plantCount"] == 80
        assert cycle["status"] == "active" and cycle["endedOn"] is None

        # one open cycle per bed
        assert (await c.post(f"{V1}/cycles", json=body)).status_code == 409
        assert (await c.post(f"{V1}/cycles", json={**body, "zone": "nope"})).status_code == 404
        assert (await c.post(f"{V1}/cycles", json={**body, "zone": "g2", "crop": "nope"})).status_code == 404
        assert (await c.post(f"{V1}/cycles", json={**body, "zone": "g2", "plantCount": 0})).status_code == 422

        rows = (await c.get(f"{V1}/cycles", params={"today": "2026-11-04"})).json()
        mine = next(x for x in rows if x["id"] == cycle["id"])
        assert mine["day"] == 21                                                    # the planting day is day 1
        assert len(rows) == 6                                                       # the five seeded cycles plus this one

        r = await c.patch(f"{V1}/cycles/{cycle['id']}", json={"plantCount": 90})
        assert r.status_code == 200 and r.json()["plantCount"] == 90

        assert (await c.post(f"{V1}/cycles/{cycle['id']}/close", json={"endedOn": "2026-10-01"})).status_code == 422
        closed = await c.post(f"{V1}/cycles/{cycle['id']}/close", json={"endedOn": "2026-11-30"})
        assert closed.status_code == 200 and closed.json()["status"] == "closed"
        assert (await c.post(f"{V1}/cycles/{cycle['id']}/close", json={"endedOn": "2026-12-01"})).status_code == 409
        # a closed bed can start a new cycle
        assert (await c.post(f"{V1}/cycles", json={**body, "plantedOn": "2026-12-05"})).status_code == 201
