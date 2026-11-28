"""What one page records must show up on the others: costs in the cost report, stock use in the costs,
a rover round in the advice, and the rover's own messages in the live view."""
import io
import zipfile

import pytest

from app.core.db import get_database
from app.routers import missions_routes
from app.services import rover_service
from app.services.broker import BrokerDown
from app.services.rover_service import live
from app.workers.mqtt_ingest import handle_message, store_telemetry


@pytest.fixture(autouse=True)
def fresh_rover():
    live.__init__()
    yield
    live.__init__()


async def cop(client, cycle="cycle-g1"):
    r = await client.get(f"/api/v1/cycles/{cycle}/cop")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_cost_report_follows_the_ledger_and_the_budget_follows_the_workbook(api_client):
    before = await cop(api_client)
    assert before["loggedUsd"] == pytest.approx(3.30)            # the seeded seedlings for G1
    assert before["budgetUsd"] == pytest.approx(before["budgetPerPlantUsd"] * 15, abs=0.01)
    assert any(line["category"] == "depreciation" for line in before["lines"])

    added = await api_client.post("/api/v1/costs", json={"plantingId": "cycle-g1", "date": "2026-11-20",
                                                         "category": "fertilizer", "amount": 12.5, "currency": "USD"})
    assert added.status_code == 201
    assert added.json()["source"] == "manual"
    after = await cop(api_client)
    assert after["loggedUsd"] == pytest.approx(before["loggedUsd"] + 12.5)
    assert after["totalCostUsd"] == pytest.approx(before["totalCostUsd"] + 12.5, abs=0.01)

    # deleting hides it: gone from the list and from the report
    assert (await api_client.delete(f"/api/v1/costs/{added.json()['id']}")).status_code == 204
    assert all(c["id"] != added.json()["id"] for c in (await api_client.get("/api/v1/costs")).json())
    assert (await cop(api_client))["loggedUsd"] == pytest.approx(before["loggedUsd"])

    # the workbook is the budget: double a unit rate, the budget per plant follows
    wb = (await api_client.get("/api/v1/finance/spreadsheet")).json()
    for row in wb["rows"]:
        row["unitRateUsd"] *= 2
    assert (await api_client.put("/api/v1/finance/spreadsheet", json=wb)).status_code == 200
    assert (await cop(api_client))["budgetPerPlantUsd"] == pytest.approx(before["budgetPerPlantUsd"] * 2, rel=0.01)


@pytest.mark.asyncio
async def test_family_labour_is_priced_from_settings(api_client):
    r = await api_client.post("/api/v1/costs", json={"plantingId": "cycle-g2", "date": "2026-11-20",
                                                     "category": "labour_family", "qty": 2, "currency": "USD"})
    assert r.status_code == 201, r.text
    assert r.json()["amountUsd"] == pytest.approx(12.40)          # 2 days x the seeded $6.20 a day
    missing = await api_client.post("/api/v1/costs", json={"date": "2026-11-20", "category": "seed", "currency": "USD"})
    assert missing.status_code == 422


@pytest.mark.asyncio
async def test_stock_used_on_a_crop_is_its_cost_and_undo_takes_it_back(api_client):
    item = next(i for i in (await api_client.get("/api/v1/stock/items")).json() if i["id"] == "stk-ca-no3")
    used = await api_client.post(f"/api/v1/stock/items/{item['id']}/use",
                                 json={"date": "2026-11-21", "qty": 2, "plantingId": "cycle-g2"})
    assert used.status_code == 201, used.text
    body = used.json()
    assert body["item"]["qtyOnHand"] == pytest.approx(item["qtyOnHand"] - 2)
    assert body["cost"]["source"] == "stock_use"
    assert body["cost"]["amountUsd"] == pytest.approx(2 * item["avgUnitCostUsd"], abs=0.01)

    g2_costs = (await api_client.get("/api/v1/costs?cycle=cycle-g2")).json()
    stock_cost = next(c for c in g2_costs if c["source"] == "stock_use")
    assert (await api_client.delete(f"/api/v1/costs/{stock_cost['id']}")).status_code == 409

    assert (await api_client.delete(f"/api/v1/stock/moves/{body['moveId']}")).status_code == 204
    back = next(i for i in (await api_client.get("/api/v1/stock/items")).json() if i["id"] == item["id"])
    assert back["qtyOnHand"] == pytest.approx(item["qtyOnHand"])
    assert all(c["source"] != "stock_use" for c in (await api_client.get("/api/v1/costs?cycle=cycle-g2")).json())

    too_much = await api_client.post(f"/api/v1/stock/items/{item['id']}/use",
                                     json={"date": "2026-11-21", "qty": 9999, "plantingId": "cycle-g2"})
    assert too_much.status_code == 422


@pytest.mark.asyncio
async def test_a_round_the_rover_reports_is_stored_and_drives_the_advice(api_client):
    db = get_database()
    report = {
        "missionId": "m-test-1", "zoneId": "g6", "status": "aborted", "abortReason": "rain", "simulated": True,
        "cellsScanned": 2, "cellsTotal": 4, "startedAt": "2026-11-28T07:00:00+00:00",
        "finishedAt": "2026-11-28T07:03:00+00:00", "distanceM": 4.0, "estDurationS": 90.0, "device": "ROVER-01",
        "grid": {"rows": 2, "cols": 2, "cellM": 2.0, "rowM": 2.5},
        "cells": [
            {"row": 0, "col": 0, "plant": True, "canopy": 0.5, "chlorosis": 0.2, "flagged": True, "disease": None,
             "disease_confidence": None, "readings": {"soil_moisture": 50.0, "soil_ph": 6.4, "nitrogen": 70.0}},
            {"row": 0, "col": 1, "plant": False, "canopy": 0.0, "chlorosis": 0.0, "flagged": False, "disease": None,
             "disease_confidence": None, "readings": {}},
        ],
    }
    await handle_message(db, "devices/rover-01/mission/result", report)
    stored = (await api_client.get("/api/v1/missions/m-test-1")).json()
    assert (stored["rows"], stored["cols"], stored["cellM"]) == (2, 2, 2.0)
    assert stored["abortReason"] == "rain"
    plant = stored["cells"][0]
    assert plant["advice"]["litres"] > 2.2                         # dry root zone: more water than the base
    assert any("Nitrogen low" in n for n in plant["advice"]["notes"])

    # a crop on G6 now gets its advice from this round
    created = await api_client.post("/api/v1/cycles", json={"zone": "g6", "plantedOn": "2026-11-01", "plantCount": 3})
    assert created.status_code == 201
    advice = next(a for a in (await api_client.get("/api/v1/advice")).json() if a["zone"] == "g6")
    assert advice["surveyed"] and advice["simulated"] and advice["partial"]
    assert advice["treesSeen"] == 1
    assert any("yellowing" in t["text"] for t in advice["todo"])


@pytest.mark.asyncio
async def test_rover_status_estop_and_a_round_nobody_answers(api_client, monkeypatch):
    db = get_database()
    assert (await api_client.get("/api/v1/missions/live")).json()["rover"]["status"] == "unknown"
    await handle_message(db, "devices/rover-01/status", {"status": "online", "device": "ROVER-01", "estop": False})
    rover = next(d for d in (await api_client.get("/api/v1/devices")).json() if d["kind"] == "rover")
    assert rover["link"] == "online"

    sent: list[tuple[str, dict, bool]] = []

    async def fake_publish(topic, payload, *, retain=False):
        sent.append((topic, payload, retain))

    monkeypatch.setattr(missions_routes, "publish", fake_publish)
    r = await api_client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 2, "cols": 3, "cellM": 2, "simulate": "rain"})
    assert r.status_code == 202, r.text
    topic, payload, _ = sent[-1]
    assert topic == "devices/rover-01/mission/set"
    assert payload["sim"] == {"rainAtCell": 3}
    assert (await api_client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 1, "cols": 1})).status_code == 409

    # nobody answers: the round is lost, not queued for ever
    monkeypatch.setattr(rover_service, "_now", lambda: 10_000_000.0)
    lost = (await api_client.get("/api/v1/missions/live")).json()["mission"]
    assert lost["status"] == "lost" and "no answer" in lost["reason"]

    e = await api_client.post("/api/v1/missions/estop", json={"engaged": True})
    assert e.status_code == 200 and e.json() == {"estop": True}
    assert sent[-1] == ("devices/rover-01/estop", {"estop": True}, True)
    assert (await api_client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 1, "cols": 1})).status_code == 409

    async def broker_down(*_a, **_k):
        raise BrokerDown("farm broker unreachable")

    monkeypatch.setattr(missions_routes, "publish", broker_down)
    down = await api_client.post("/api/v1/missions/estop", json={"engaged": False})
    assert down.status_code == 503
    assert live.estop is True                                       # not released when the rover did not hear it

    status = (await api_client.get("/api/v1/status")).json()
    assert status["db"]["zones"] == 6 and status["rover"]["estop"] is True


@pytest.mark.asyncio
async def test_diagnosis_weighs_the_readings(api_client):
    db = get_database()
    assert (await api_client.post("/api/v1/zones", json={"label": "Test bed", "areaM2": 20})).status_code == 201
    zone = next(z for z in (await api_client.get("/api/v1/zones")).json() if z["zone"] == "test-bed")
    assert zone["moisturePct"] is None and zone["soilProfile"] is None   # no sensor yet, nothing invented

    nothing = (await api_client.get("/api/v1/diagnosis?zone=test-bed&symptom=leaf_curl")).json()
    assert nothing["verdict"] == "no_data"

    await store_telemetry(db, "farm/farm-01/zone/test-bed/telemetry",
                          {"measurements": [{"metric": "soil_moisture", "value": 50, "unit": "%"}]})
    curl = (await api_client.get("/api/v1/diagnosis?zone=test-bed&symptom=leaf_curl")).json()
    assert curl["verdict"] == "supported"
    assert next(e for e in curl["evidence"] if e["metric"] == "soil_moisture")["met"] is True
    spot = (await api_client.get("/api/v1/diagnosis?zone=test-bed&symptom=leaf_spot")).json()
    assert spot["verdict"] == "not_supported"


@pytest.mark.asyncio
async def test_leaf_results_are_converted_and_compared(api_client):
    s = (await api_client.post("/api/v1/leaf-tests", json={"zone": "g2", "takenOn": "2026-11-25", "leafPairs": 10})).json()
    r = await api_client.put(f"/api/v1/leaf-tests/{s['id']}/results", json={
        "lab": "Test lab", "resultsOn": "2026-11-27",
        "values": [{"nutrient": "N", "value": 42000, "unit": "mg/kg"}, {"nutrient": "K", "value": 2.0, "unit": "%"}]})
    assert r.status_code == 200, r.text
    doc = r.json()
    n = next(x for x in doc["results"] if x["symbol"] == "N")
    assert n["inBase"] == pytest.approx(4.2) and n["status"] == "ok"
    assert doc["low"] == ["K"] and "Ca" in doc["check"]
    overview = (await api_client.get("/api/v1/leaf-tests")).json()
    assert any(c["zone"] == "g2" for c in overview["compare"])
    bad = await api_client.put(f"/api/v1/leaf-tests/{s['id']}/results",
                               json={"values": [{"nutrient": "N", "value": 1, "unit": "bananas"}]})
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_photos_round_trip(api_client, tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "photo_dir", str(tmp_path))
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    saved = await api_client.post("/api/v1/photos", data={"zone": "g1", "part": "leaf", "row": "1", "col": "1"},
                                  files={"photo": ("leaf.png", png, "image/png")})
    assert saved.status_code == 201, saved.text
    photo = saved.json()
    assert photo["zoneLabel"] == "G1 Greenhouse North" and photo["tree"] == "R2 T2"
    assert photo["readings"] and "soil_moisture" in photo["readings"]["values"]
    assert (await api_client.get(f"/api/v1/photos/{photo['id']}/image")).content == png

    check = (await api_client.post("/api/v1/photos/check?zone=g1&row=1&col=1",
                                   files={"photo": ("leaf.png", png, "image/png")})).json()
    assert check["status"] == "uncertain" and check["label"] is None and check["tree"]["found"] is True

    conf = await api_client.put(f"/api/v1/photos/{photo['id']}/confirm", json={"label": "early_blight", "name": "Dara"})
    assert conf.status_code == 200 and conf.json()["expertLabel"] == "early_blight"
    lib = (await api_client.get("/api/v1/photos")).json()
    assert lib["confirmed"] == 1
    assert next(p for p in lib["progress"] if p["label"] == "early_blight")["photos"] == 1

    z = zipfile.ZipFile(io.BytesIO((await api_client.get("/api/v1/photos/export.zip")).content))
    assert "labels.csv" in z.namelist() and any(n.startswith("early_blight/") for n in z.namelist())

    assert (await api_client.delete(f"/api/v1/photos/{photo['id']}")).status_code == 204
    assert (await api_client.get("/api/v1/photos")).json()["saved"] == 0
