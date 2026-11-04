"""M1: farm settings, crops in the database (any crop), beds and crop cycles.

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
        assert body["et0MmDay"] == 4.5 and body["irrigationEfficiency"] == 0.9
        assert body["familyWageUsdPerDay"] is None and body["waterCostPerM3Usd"] is None
        assert body["landRentUsdPerHaYear"] is None                                # unset means unset, never a guess

        r = await c.put(f"{V1}/farm/settings", json={"khrPerUsd": 4100, "familyWageUsdPerDay": 6,
                                                      "waterCostPerM3Usd": 0.1, "landRentUsdPerHaYear": 200})
        assert r.status_code == 200 and r.json()["rateConfirmed"] is True
        again = (await c.get(f"{V1}/farm/settings")).json()
        assert again["khrPerUsd"] == 4100 and again["familyWageUsdPerDay"] == 6
        assert again["et0MmDay"] == 4.5                                            # not sent, so unchanged

        for bad in ({"khrPerUsd": 0}, {"irrigationEfficiency": 1.5}, {"et0MmDay": -1}):
            assert (await c.put(f"{V1}/farm/settings", json=bad)).status_code == 422


@pgdb.with_db("aaf_m1_crops")
async def test_crops_live_in_the_database_and_any_crop_can_be_added(Session):
    await seeded(Session)
    chilli = {"name": "Chilli pepper", "kc": {"ini": 0.6, "mid": 1.05, "end": 0.9}, "stageDays": [20, 30, 40, 20]}
    async with pgdb.api(Session) as c:
        tomato = next(x for x in (await c.get(f"{V1}/crops")).json() if x["slug"] == "tomato")
        assert tomato["name"] == "Tomato" and tomato["kc"] == {"ini": 0.6, "mid": 1.15, "end": 0.8}
        assert tomato["stageDays"] == [30, 40, 40, 25] and "FAO" in tomato["source"]

        r = await c.post(f"{V1}/crops", json=chilli)
        assert r.status_code == 201 and r.json()["slug"] == "chilli-pepper"
        assert "entered by the farmer" in r.json()["source"].lower()               # not presented as checked
        assert (await c.post(f"{V1}/crops", json=chilli)).status_code == 409
        assert (await c.post(f"{V1}/crops", json={**chilli, "kc": {"ini": 0, "mid": 1, "end": 1}})).status_code == 422
        assert (await c.post(f"{V1}/crops", json={**chilli, "name": "Short", "stageDays": [0, 1, 1, 1]})).status_code == 422

        # the water planner uses the new crop's own numbers
        p = (await c.post(f"{V1}/water-plan", json={"crop": "chilli-pepper", "plants": 100,
                                                     "areaPerPlantM2": 0.5, "et0MmDay": 4.5})).json()
        assert p["cycleDays"] == 110 and p["assumptions"]["stageDays"] == [20, 30, 40, 20]
        assert (await c.post(f"{V1}/water-plan", json={"crop": "unobtainium", "plants": 1,
                                                        "et0MmDay": 4.5})).status_code == 422


@pgdb.with_db("aaf_m1_cycles")
async def test_beds_and_cycles(Session):
    await seeded(Session)
    async with pgdb.api(Session) as c:
        bed = await c.post(f"{V1}/zones", json={"label": "Chilli bed 1", "areaM2": 40})
        assert bed.status_code == 201 and bed.json()["name"] == "chilli-bed-1"
        assert (await c.post(f"{V1}/zones", json={"label": "Chilli bed 1"})).status_code == 409   # same name twice

        body = {"zone": "chilli-bed-1", "crop": "tomato", "plantedOn": "2026-10-15",
                "plantCount": 80, "areaM2": 40, "variety": "local"}
        r = await c.post(f"{V1}/cycles", json=body)
        assert r.status_code == 201
        cycle = r.json()
        assert cycle["bedLabel"] == "Chilli bed 1" and cycle["cropName"] == "Tomato" and cycle["plantCount"] == 80
        assert cycle["status"] == "active" and cycle["endedOn"] is None

        # one open cycle per bed
        assert (await c.post(f"{V1}/cycles", json=body)).status_code == 409
        assert (await c.post(f"{V1}/cycles", json={**body, "zone": "nope"})).status_code == 404
        assert (await c.post(f"{V1}/cycles", json={**body, "zone": "zone-b", "crop": "nope"})).status_code == 404
        assert (await c.post(f"{V1}/cycles", json={**body, "zone": "zone-b", "plantCount": 0})).status_code == 422

        rows = (await c.get(f"{V1}/cycles", params={"today": "2026-11-04"})).json()
        mine = next(x for x in rows if x["id"] == cycle["id"])
        assert mine["day"] == 21                                                    # the planting day is day 1
        assert len(rows) == 3                                                       # the two seeded beds plus this one

        r = await c.patch(f"{V1}/cycles/{cycle['id']}", json={"plantCount": 90})
        assert r.status_code == 200 and r.json()["plantCount"] == 90

        assert (await c.post(f"{V1}/cycles/{cycle['id']}/close", json={"endedOn": "2026-10-01"})).status_code == 422
        closed = await c.post(f"{V1}/cycles/{cycle['id']}/close", json={"endedOn": "2026-11-30"})
        assert closed.status_code == 200 and closed.json()["status"] == "closed"
        assert (await c.post(f"{V1}/cycles/{cycle['id']}/close", json={"endedOn": "2026-12-01"})).status_code == 409
        # a closed bed can start a new cycle
        assert (await c.post(f"{V1}/cycles", json={**body, "plantedOn": "2026-12-05"})).status_code == 201


@pgdb.with_db("aaf_m1_planner")
async def test_water_planner_over_the_api(Session):
    await seeded(Session)
    body = {"crop": "tomato", "plants": 100, "areaPerPlantM2": 0.5, "et0MmDay": 4.5, "efficiency": 0.9}
    async with pgdb.api(Session) as c:
        b = (await c.post(f"{V1}/water-plan", json={**body, "plantedOn": "2026-10-14", "today": "2026-11-04"})).json()
        assert b["cycleDays"] == 135 and len(b["days"]) == 135
        assert abs(b["netM3"] - 27.781875) < 1e-3 and abs(b["grossM3"] - 30.8687) < 1e-3
        assert b["today"]["day"] == 22 and b["today"]["stage"] == "initial"
        assert "FAO" in b["source"] and b["assumptions"]["et0MmDay"] == 4.5
        assert (await c.post(f"{V1}/water-plan", json=body)).json()["today"] is None
        for patch in ({"plants": 0}, {"efficiency": 0}, {"et0MmDay": -1}, {"crop": "unobtainium"}):
            assert (await c.post(f"{V1}/water-plan", json={**body, **patch})).status_code == 422
        crops = (await c.get(f"{V1}/water-plan/crops")).json()
        assert any(x["id"] == "tomato" and x["stageDays"] == [30, 40, 40, 25] for x in crops)
