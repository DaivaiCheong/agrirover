import pytest
from datetime import datetime, timezone

from app.core.db import get_database
from app.workers.mqtt_ingest import store_telemetry


@pytest.mark.asyncio
async def test_health_and_seeded_tomato_farm(api_client):
    h = await api_client.get("/health")
    assert h.status_code == 200
    assert h.json()["db"] == "mongodb"
    assert h.json()["zones"] == 6

    zones = (await api_client.get("/api/v1/zones")).json()
    assert len(zones) == 6
    assert zones[0]["label"] == "G1 Greenhouse North"
    assert zones[0]["soilProfile"]["texture"] == "Sandy loam"

    cycles = (await api_client.get("/api/v1/cycles")).json()
    active = [c for c in cycles if c["status"] == "active"]
    assert len(active) == 5
    assert sum(c["plantCount"] for c in active) == 69
    assert all(c["crop"] == "tomato" for c in active)

    conds = (await api_client.get("/api/v1/conditions")).json()
    assert len(conds) == 6
    g1 = next(c for c in conds if c["zone"] == "g1")
    assert g1["stage"]["title"] == "Flowering & early fruit set"

    advice = (await api_client.get("/api/v1/advice")).json()
    assert len(advice) == 5

    sched = (await api_client.get("/api/v1/schedule?days=7")).json()
    assert len(sched["dates"]) == 7
    assert len(sched["blocks"]) == 5
    assert len(sched["events"]) > 0


@pytest.mark.asyncio
async def test_missions_cells_telemetry_and_mqtt_persistence(api_client):
    surveys = (await api_client.get("/api/v1/missions")).json()
    assert len(surveys) >= 5
    g1_latest = next(s for s in surveys if s["zone"] == "g1")
    detail = (await api_client.get(f"/api/v1/missions/{g1_latest['id']}")).json()
    assert detail["rows"] == 4
    assert detail["cols"] == 4
    assert len(detail["cells"]) == 16

    # Verify G2 R2 T2 low soil Nitrogen (64 mg/kg) is stored in MongoDB
    g2_latest = next(s for s in surveys if s["zone"] == "g2")
    g2_detail = (await api_client.get(f"/api/v1/missions/{g2_latest['id']}")).json()
    r2_t2 = next(c for c in g2_detail["cells"] if c["row"] == 1 and c["col"] == 1)
    assert r2_t2["readings"]["nitrogen"] == 64
    assert r2_t2["disease"] == "chlorosis"

    # MQTT telemetry validation drops impossible pH (655.35) and stores valid moisture
    db = get_database()
    stored = await store_telemetry(
        db,
        "farm/farm-01/zone/g1/telemetry",
        {
            "device": "ESP-FIELD-01",
            "measurements": [
                {"metric": "soil_moisture", "value": 63.4, "unit": "%"},
                {"metric": "soil_ph", "value": 655.35, "unit": "pH"},
            ],
        },
        now=datetime.now(timezone.utc),
    )
    assert stored == 1

    tel = (await api_client.get("/api/v1/telemetry/g1?metrics=soil_moisture,soil_ph&hours=24")).json()
    assert len(tel["series"]["soil_moisture"]) > 0


@pytest.mark.asyncio
async def test_finance_workbook_and_crud_persistence_in_mongodb(api_client):
    # Excel Workbook defaults & live save/reset
    wb = (await api_client.get("/api/v1/finance/spreadsheet")).json()
    assert wb["plants"] == 69
    assert wb["sellingPricePerKg"] == 0.80
    assert len(wb["rows"]) == 6

    wb["plants"] = 500
    wb["sellingPricePerKg"] = 1.15
    saved = (await api_client.put("/api/v1/finance/spreadsheet", json=wb)).json()
    assert saved["plants"] == 500
    assert saved["sellingPricePerKg"] == 1.15

    reloaded = (await api_client.get("/api/v1/finance/spreadsheet")).json()
    assert reloaded["plants"] == 500

    reset = (await api_client.post("/api/v1/finance/spreadsheet/reset")).json()
    assert reset["plants"] == 69
    assert reset["sellingPricePerKg"] == 0.80

    # Bed creation + Soil Profile update
    new_bed = await api_client.post("/api/v1/zones", json={"label": "G7 Nursery", "areaM2": 40})
    assert new_bed.status_code == 201
    prof = await api_client.put(
        "/api/v1/zones/g7-nursery/profile",
        json={"texture": "Loam", "rootingDepthCm": 55, "drainage": "Well drained", "organicMatterPct": 3.2},
    )
    assert prof.status_code == 200
    assert prof.json()["texture"] == "Loam"

    # Harvest & Sales persistence on cycle-g1
    h_res = await api_client.post(
        "/api/v1/cycles/cycle-g1/harvests",
        json={"date": "2026-11-27", "kgTotal": 10.0, "kgMarketable": 9.5, "kgHome": 0.5, "note": "Test pick"},
    )
    assert h_res.status_code == 201
    s_res = await api_client.post(
        "/api/v1/cycles/cycle-g1/sales",
        json={"date": "2026-11-27", "kg": 9.5, "pricePerKg": 0.90, "currency": "USD", "buyer": "Local Mart"},
    )
    assert s_res.status_code == 201

    cop = (await api_client.get("/api/v1/cycles/cycle-g1/cop")).json()
    assert cop["kgMarketable"] == 9.5
    assert cop["revenueUsd"] == 8.55

    # Stock Purchase & Usage + Assets + Settings
    items = (await api_client.get("/api/v1/stock/items")).json()
    assert len(items) >= 5
    stock_in = await api_client.post(
        f"/api/v1/stock/items/{items[0]['id']}/in",
        json={"date": "2026-11-27", "qty": 10, "unitPrice": 1.2, "currency": "USD"},
    )
    assert stock_in.status_code == 200

    settings_res = await api_client.put("/api/v1/farm/settings", json={"khrPerUsd": 4100})
    assert settings_res.status_code == 200
    assert settings_res.json()["khrPerUsd"] == 4100

    # Costs CRUD
    c_post = await api_client.post(
        "/api/v1/costs",
        json={"plantingId": "cycle-g1", "date": "2026-11-27", "category": "fertilizer", "description": "K2SO4 spot", "amount": 2.5, "currency": "USD"},
    )
    assert c_post.status_code == 201
    c_id = c_post.json()["id"]
    costs_list = (await api_client.get("/api/v1/costs?cycle=cycle-g1")).json()
    assert any(c["id"] == c_id for c in costs_list)
    assert (await api_client.delete(f"/api/v1/costs/{c_id}")).status_code == 204

    # Assets CRUD + retire
    a_post = await api_client.post(
        "/api/v1/assets",
        json={"name": "Drip Manifold B", "costUsd": 120.0, "boughtOn": "2026-11-01", "lifeYears": 4},
    )
    assert a_post.status_code == 201
    a_id = a_post.json()["id"]
    a_ret = await api_client.patch(f"/api/v1/assets/{a_id}/retire")
    assert a_ret.status_code == 200
    assert a_ret.json()["status"] == "retired"

    # Leaf lab samples + guide + cycle orchard view + cycle create/patch/close
    leaf_post = await api_client.post(
        "/api/v1/leaf-tests",
        json={"zone": "g1", "takenOn": "2026-11-27", "leafPairs": 8, "note": "Upper canopy check"},
    )
    assert leaf_post.status_code == 201
    leaf_overview = (await api_client.get("/api/v1/leaf-tests")).json()
    assert any(s["id"] == leaf_post.json()["id"] for s in leaf_overview["samples"])

    guide = (await api_client.get("/api/v1/photos/guide")).json()
    assert len(guide) >= 5

    orchard = (await api_client.get("/api/v1/cycles/cycle-g1/orchard")).json()
    assert orchard["cycle"]["id"] == "cycle-g1"

    new_cyc = await api_client.post(
        "/api/v1/cycles",
        json={"zone": "g6", "crop": "tomato", "plantedOn": "2026-11-27", "plantCount": 12, "variety": "Roma Tomato", "setup": "open_field"},
    )
    assert new_cyc.status_code == 201
    cyc_id = new_cyc.json()["id"]
    patched = await api_client.patch(f"/api/v1/cycles/{cyc_id}", json={"plantCount": 14})
    assert patched.status_code == 200
    assert patched.json()["plantCount"] == 14
    closed = await api_client.post(f"/api/v1/cycles/{cyc_id}/close", json={"endedOn": "2026-11-28"})
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
