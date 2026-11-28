import asyncio
import csv
import io
import os
import uuid
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.db import get_db
from app.services import farm_service, photo_check, photo_store
from app.services.clock import farm_today
from app.services.errors import Invalid, NotFound
from app.services.photo_store import latest_cell
from app.services.tomato import (
    DISEASES,
    PARAM_META,
    SYMPTOM_DISEASE,
    SYMPTOM_RULES,
    SYMPTOMS,
    TARGETS,
    cycle_public_dict,
    rate_metric,
)

router = APIRouter()
MAX_BYTES = 8 * 1024 * 1024
STALE_AFTER_S = 36 * 3600          # a reading older than a day and a half no longer describes the bed

LEAF_NUTRIENTS = [
    {"code": "N", "name": "Nitrogen", "symbol": "N", "base": "%", "range": [3.5, 5.0]},
    {"code": "P", "name": "Phosphorus", "symbol": "P", "base": "%", "range": [0.3, 0.7]},
    {"code": "K", "name": "Potassium", "symbol": "K", "base": "%", "range": [2.8, 4.5]},
    {"code": "Ca", "name": "Calcium", "symbol": "Ca", "base": "%", "range": [1.2, 2.5]},
    {"code": "Mg", "name": "Magnesium", "symbol": "Mg", "base": "%", "range": [0.3, 0.8]},
]
_NUTRIENT = {n["symbol"]: n for n in LEAF_NUTRIENTS}
_TO_PERCENT = {"%": 1.0, "g/kg": 0.1, "mg/kg": 0.0001, "ppm": 0.0001}
DISEASE_BY_ID = {d["id"]: d for d in DISEASES}
META_BY_METRIC = {m[0]: m for m in PARAM_META}


class SampleIn(BaseModel):
    zone: str
    takenOn: date
    leafPairs: int = Field(ge=1, le=1000)
    row: int | None = Field(None, ge=0)
    col: int | None = Field(None, ge=0)
    collectedBy: str | None = Field(None, max_length=80)
    note: str | None = Field(None, max_length=2000)


class ValueIn(BaseModel):
    nutrient: str
    value: float = Field(ge=0, lt=10_000_000)
    unit: str


class ResultsIn(BaseModel):
    lab: str | None = Field(None, max_length=120)
    resultsOn: date | None = None
    values: list[ValueIn]


class ConfirmPhotoIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=80)
    note: str | None = Field(None, max_length=500)


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login", tags=["auth"])
async def login(_: LoginIn):
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "single-farm operator mode enabled")


# ---- Diagnosis: a symptom set against the bed's live readings ----

def _age_seconds(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        then = datetime.fromisoformat(iso)
    except ValueError:
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - then).total_seconds())


def correlate(symptom: str, bed: dict, source: str = "named") -> dict:
    params = {p["metric"]: p for p in bed.get("params", [])}
    evidence = []
    for metric, op, limit in SYMPTOM_RULES[symptom]:
        p = params.get(metric)
        _m, label, _short, unit, dec = META_BY_METRIC[metric]
        value = p["value"] if p else None
        age = _age_seconds(p.get("recordedAt")) if p else None
        stale = age is not None and age > STALE_AFTER_S
        met = None if value is None or stale else (value < limit if op == "<" else value > limit)
        evidence.append({"metric": metric, "label": label, "unit": unit, "decimals": dec, "op": op, "limit": limit,
                         "value": value, "ageSeconds": None if age is None else round(age), "stale": stale, "met": met})
    known = [e for e in evidence if e["met"] is not None]
    met = [e for e in known if e["met"]]
    if not known:
        verdict, why = "no_data", "No fresh readings for this bed, so the readings cannot say."
    elif met:
        verdict = "supported"
        why = "The readings fit this: " + "; ".join(
            f"{e['label'].lower()} {round(e['value'], e['decimals'])} {e['unit']} ({e['op']} {e['limit']:g})" for e in met) + "."
    else:
        verdict, why = "not_supported", "The readings are inside the ranges that cause this. Look for another cause."
    disease = DISEASE_BY_ID.get(SYMPTOM_DISEASE.get(symptom, ""))
    stage = bed.get("stage")
    return {
        "symptom": symptom,
        "title": SYMPTOMS[symptom],
        "verdict": verdict,
        "evidence": evidence,
        "explanation": why,
        "basis": "practice",
        "caveat": "Readings can support a cause; they cannot confirm a disease. Check the plant itself.",
        "looksLike": disease["card"]["signs"] if disease else None,
        "stage": {"key": stage["key"], "title": stage["title"], "day": stage["day"]} if stage else None,
        "zone": bed["zone"],
        "label": bed.get("label"),
        "source": source,
    }


@router.get("/diagnosis/symptoms", tags=["diagnosis"])
async def list_symptoms():
    return [{"id": k, "title": v} for k, v in SYMPTOMS.items()]


@router.get("/diagnosis", tags=["diagnosis"])
async def diagnose_zone(zone: str, symptom: str, farm: str | None = None, db=Depends(get_db)):
    if symptom not in SYMPTOMS:
        raise Invalid(f"unknown symptom {symptom!r}")
    conds = await farm_service.zone_conditions(db, farm or settings.farm_name)
    bed = next((c for c in conds if c["zone"] == zone), None)
    if bed is None:
        raise NotFound(f"unknown bed {zone!r}")
    return correlate(symptom, bed)


# ---- Leaf tests ----

def rate_leaf(values: list[ValueIn]) -> tuple[list[dict], list[str], list[str], list[str]]:
    results, low, high = [], [], []
    for v in values:
        n = _NUTRIENT.get(v.nutrient)
        if n is None:
            raise Invalid(f"unknown nutrient {v.nutrient!r}; use one of {', '.join(_NUTRIENT)}")
        factor = _TO_PERCENT.get(v.unit.strip().lower())
        if factor is None:
            raise Invalid(f"unit {v.unit!r} is not understood; use %, g/kg or mg/kg")
        in_base = round(v.value * factor, 4)
        lo, hi = n["range"]
        state = "low" if in_base < lo else "high" if in_base > hi else "ok"
        if state == "low":
            low.append(n["symbol"])
        elif state == "high":
            high.append(n["symbol"])
        results.append({"nutrient": n["name"], "symbol": n["symbol"], "value": v.value, "unit": v.unit,
                        "inBase": in_base, "base": n["base"], "status": state})
    given = {r["symbol"] for r in results}
    check = [n["symbol"] for n in LEAF_NUTRIENTS if n["symbol"] not in given]
    return results, low, high, check


@router.get("/leaf-tests", tags=["leaf tests"])
async def leaf_overview(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    samples = await db.leaf_tests.find({"farmName": fname}, {"_id": 0, "farmName": 0}).sort("takenOn", -1).to_list(length=200)
    waiting = sum(1 for s in samples if not s.get("results"))
    out_of_range = sum(1 for s in samples if s.get("low") or s.get("high"))
    compare, seen = [], set()
    for s in samples:                                # newest first: the first with results is each bed's latest
        if not s.get("results") or s["zone"] in seen:
            continue
        seen.add(s["zone"])
        compare.append({
            "zone": s["zone"], "label": s.get("zoneLabel") or s["zone"].upper(), "takenOn": s["takenOn"],
            "stage": s.get("stage") or "", "variety": s.get("variety"),
            "values": {r["symbol"]: {"inBase": r["inBase"], "status": r["status"]} for r in s["results"]},
        })
    cycles = await db.cycles.find({"farmName": fname, "status": "active"}, {"_id": 0}).sort("zone", 1).to_list(length=100)
    today = farm_today()
    blocks = []
    for c in cycles:
        pub = cycle_public_dict(c, today)
        blocks.append({"zone": c["zone"], "label": c["bedLabel"], "variety": c.get("variety"), "day": pub["day"] or 1,
                       "stage": pub["stageTitle"] or ""})
    return {
        "samples": samples,
        "total": len(samples),
        "waiting": waiting,
        "withResults": len(samples) - waiting,
        "outOfRange": out_of_range,
        "compare": compare,
        "blocks": blocks,
        "nutrients": LEAF_NUTRIENTS,
        "units": ["%", "g/kg", "mg/kg"],
        "rangeSource": "AgriRover tomato leaf tissue guide (youngest fully open leaf at first flowering)",
    }


@router.post("/leaf-tests", status_code=201, tags=["leaf tests"])
async def add_leaf_sample(body: SampleIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    z = await db.zones.find_one({"farmName": fname, "zone": body.zone}, {"_id": 0})
    if z is None:
        raise NotFound(f"unknown bed {body.zone!r}")
    cyc = await db.cycles.find_one({"farmName": fname, "zone": body.zone, "status": "active"}, {"_id": 0})
    pub = cycle_public_dict(cyc, body.takenOn) if cyc else None
    doc = {
        "id": f"leaf-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "zone": body.zone,
        "zoneLabel": z.get("label") or body.zone.upper(),
        "variety": cyc.get("variety") if cyc else None,
        "takenOn": body.takenOn.isoformat(),
        "cropDay": pub["day"] if pub else None,
        "stage": (pub["stageTitle"] or "") if pub else "",
        "atBloom": bool(pub and pub["stage"] == "flowering"),
        "tree": f"R{body.row + 1} T{body.col + 1}" if body.row is not None and body.col is not None else None,
        "leafPairs": body.leafPairs,
        "collectedBy": body.collectedBy,
        "note": body.note,
        "lab": None,
        "resultsOn": None,
        "results": [],
        "low": [],
        "high": [],
        "check": [],
    }
    await db.leaf_tests.insert_one(dict(doc))
    doc.pop("farmName", None)
    return doc


@router.put("/leaf-tests/{sample_id}/results", tags=["leaf tests"])
async def save_leaf_results(sample_id: str, body: ResultsIn, farm: str | None = None, db=Depends(get_db)):
    if not body.values:
        raise Invalid("enter at least one lab value")
    results, low, high, check = rate_leaf(body.values)
    doc = await db.leaf_tests.find_one_and_update(
        {"farmName": farm or settings.farm_name, "id": sample_id},
        {"$set": {"lab": body.lab, "resultsOn": body.resultsOn.isoformat() if body.resultsOn else None,
                  "results": results, "low": low, "high": high, "check": check}},
        projection={"_id": 0, "farmName": 0},
        return_document=True,
    )
    if doc is None:
        raise NotFound("leaf sample not found")
    return doc


@router.delete("/leaf-tests/{sample_id}", status_code=204, tags=["leaf tests"])
async def delete_leaf_sample(sample_id: str, farm: str | None = None, db=Depends(get_db)):
    res = await db.leaf_tests.delete_one({"farmName": farm or settings.farm_name, "id": sample_id})
    if res.deleted_count == 0:
        raise NotFound("leaf sample not found")


# ---- Photos & disease guide ----

@router.get("/photos/guide", tags=["photos"])
async def disease_guide():
    return DISEASES


@router.get("/photos/labels", tags=["photos"])
async def photo_labels():
    return {
        "labels": [{"id": d["id"], "title": d["title"]} for d in DISEASES] + [{"id": "healthy", "title": "Healthy"}],
        "parts": ["leaf", "fruit", "stem", "whole"],
        "online": bool(settings.ollama_model),
    }


async def tree_context(db, farm_name: str, zone: str, row: int, col: int) -> dict:
    survey, cell = await latest_cell(db, farm_name, zone, row, col)
    cyc = await db.cycles.find_one({"farmName": farm_name, "zone": zone, "status": "active"}, {"_id": 0})
    pub = cycle_public_dict(cyc, farm_today()) if cyc else None
    readings, worst = [], None
    for metric, label, _short, unit, dec in PARAM_META:
        value = (cell or {}).get("readings", {}).get(metric)
        lo, hi = TARGETS[metric]
        _status, direction = rate_metric(metric, value)
        state = None if value is None else (direction or "ok")
        readings.append({"metric": metric, "label": label, "unit": unit,
                         "value": None if value is None else round(value, dec), "low": lo, "high": hi, "state": state})
        if direction and worst is None and metric in ("soil_moisture", "soil_ph", "nitrogen", "soil_ec"):
            worst = (metric, label, direction)
    soil = None
    if worst:
        metric, label, direction = worst
        soil = {"cause": metric, "text": f"{label} is {direction} at this plant.",
                "action": "Fix the root zone first: a sick-looking leaf often follows the soil."}
    return {
        "zone": zone, "name": f"R{row + 1} T{col + 1}", "row": row, "col": col, "found": cell is not None,
        "roundAt": (survey or {}).get("finishedAt"), "simulated": bool((survey or {}).get("simulated")),
        "stage": pub["stageTitle"] if pub else None, "flagged": bool(cell and cell.get("flagged")),
        "readings": readings, "soil": soil,
    }


@router.get("/photos/tree", tags=["photos"])
async def photo_tree(zone: str, row: int = Query(..., ge=0), col: int = Query(..., ge=0), farm: str | None = None, db=Depends(get_db)):
    return await tree_context(db, farm or settings.farm_name, zone, row, col)


@router.get("/photos", tags=["photos"])
async def list_photos(status: str = "all", farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    everything = await db.photos.find({"farmName": fname}, {"_id": 0, "farmName": 0, "filePath": 0}).sort("takenAt", -1).to_list(length=1000)
    if status == "confirmed":
        photos = [p for p in everything if p.get("expertLabel")]
    elif status == "to_confirm":
        photos = [p for p in everything if not p.get("expertLabel")]
    else:
        photos = everything
    confirmed = [p for p in everything if p.get("expertLabel")]
    target_photos, target_days = 25, 14
    progress = []
    for d in DISEASES:
        mine = [p for p in confirmed if p.get("expertLabel") == d["id"]]
        days = len({p.get("takenOn") for p in mine})
        progress.append({"label": d["id"], "title": d["title"], "photos": len(mine), "days": days,
                         "ready": len(mine) >= target_photos and days >= target_days})
    return {
        "photos": photos,
        "saved": len(everything),
        "toConfirm": len(everything) - len(confirmed),
        "confirmed": len(confirmed),
        "targetPhotos": target_photos,
        "targetDays": target_days,
        "progress": progress,
    }


@router.post("/photos", status_code=201, tags=["photos"])
async def save_photo(
    photo: UploadFile = File(...),
    zone: str = Form(...),
    part: str = Form("leaf"),
    row: int | None = Form(None),
    col: int | None = Form(None),
    label: str | None = Form(None),
    note: str | None = Form(None),
    modelLabel: str | None = Form(None),
    modelSeen: str | None = Form(None),
    farm: str | None = None,
    db=Depends(get_db),
):
    data = await photo.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "photo larger than 8 MB")
    if not data:
        raise Invalid("the photo is empty")
    return await photo_store.save_photo(db, farm or settings.farm_name, data, zone=zone, part=part, row=row, col=col,
                                        label=label, note=note, filename=photo.filename,
                                        model_label=modelLabel, model_seen=modelSeen)


@router.post("/photos/check", tags=["photos"])
async def check_photo(photo: UploadFile = File(...), zone: str | None = None, row: int | None = None, col: int | None = None,
                      farm: str | None = None, db=Depends(get_db)):
    """The photo check (services/photo_check.py). Without a model it says so instead of guessing a disease."""
    fname = farm or settings.farm_name
    data = await photo.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "photo larger than 8 MB")
    tree = await tree_context(db, fname, zone, row, col) if zone and row is not None and col is not None else None
    out = {"status": "uncertain", "label": None, "confidence": None, "seen": None, "matches": [], "symptom": None,
           "correlation": None, "tree": tree}
    classifier = photo_check.get_classifier()
    if classifier is None:
        return {**out, "note": f"{photo_check.NO_MODEL} Save the photo so an expert can confirm it, and compare it with the guide."}
    try:
        result = await asyncio.to_thread(classifier.classify, data, photo_check.TOMATO)
    except photo_check.ModelUnavailable as exc:
        return {**out, "note": f"The photo check could not run: {exc}."}
    if result is None:
        return {**out, "note": "The model is not sure. Take a closer, sharper photo in daylight, or ask an expert."}
    if result.label in (photo_check.HEALTHY, photo_check.PROBLEM):
        word = "Looks healthy." if result.label == photo_check.HEALTHY else "Something is wrong. Compare it with the guide."
        return {**out, "status": "ok", "label": result.label, "seen": result.seen, "note": f"{word} A first look, not a diagnosis."}
    guide = photo_check.TOMATO.by_id
    matches = [guide[x] for x in (result.label, result.also) if x in guide]
    symptom = guide[result.label].get("symptom")
    correlation = None
    if zone and symptom in SYMPTOMS:
        bed = next((c for c in await farm_service.zone_conditions(db, fname) if c["zone"] == zone), None)
        correlation = correlate(symptom, bed, source="photo") if bed else None
    return {**out, "status": "ok", "label": result.label, "seen": result.seen, "matches": matches, "symptom": symptom,
            "correlation": correlation, "note": "Possible matches to compare with the plant: a first look, not a diagnosis."}


@router.get("/photos/export.zip", tags=["photos"])
async def export_photos(status: str = "confirmed", farm: str | None = None, db=Depends(get_db)):
    """The photos and a labels.csv, for training a model. Confirmed photos by default."""
    q: dict = {"farmName": farm or settings.farm_name}
    if status == "confirmed":
        q["expertLabel"] = {"$ne": None}
    elif status == "to_confirm":
        q["expertLabel"] = None
    photos = await db.photos.find(q, {"_id": 0}).sort("takenAt", 1).to_list(length=5000)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        rows = [["file", "label", "farmer_label", "expert", "zone", "tree", "part", "taken_on"]]
        for p in photos:
            path = p.get("filePath")
            if not path or not os.path.exists(path):
                continue
            name = f"{p.get('expertLabel') or 'unlabelled'}/{p['id']}{Path(path).suffix or '.jpg'}"
            zf.write(path, name)
            rows.append([name, p.get("expertLabel") or "", p.get("farmerLabel") or "", p.get("expertName") or "",
                         p.get("zone") or "", p.get("tree") or "", p.get("part") or "", p.get("takenOn") or ""])
        out = io.StringIO()
        csv.writer(out).writerows(rows)
        zf.writestr("labels.csv", out.getvalue())
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="tomato-photos-{status}.zip"'})


@router.get("/photos/{photo_id}/image", tags=["photos"])
async def photo_image(photo_id: str, farm: str | None = None, db=Depends(get_db)):
    doc = await db.photos.find_one({"farmName": farm or settings.farm_name, "id": photo_id}, {"_id": 0})
    if not doc or not doc.get("filePath") or not os.path.exists(doc["filePath"]):
        raise NotFound("photo not found")
    return FileResponse(doc["filePath"])


@router.put("/photos/{photo_id}/confirm", tags=["photos"])
async def confirm_photo(photo_id: str, body: ConfirmPhotoIn, farm: str | None = None, db=Depends(get_db)):
    known = {d["id"] for d in DISEASES} | {"healthy"}
    if body.label not in known:
        raise Invalid(f"unknown label {body.label!r}")
    doc = await db.photos.find_one_and_update(
        {"farmName": farm or settings.farm_name, "id": photo_id},
        {"$set": {"expertLabel": body.label, "expertName": body.name, "expertNote": body.note,
                  "expertAt": datetime.now(timezone.utc).isoformat()}},
        projection={"_id": 0, "farmName": 0, "filePath": 0},
        return_document=True,
    )
    if doc is None:
        raise NotFound("photo not found")
    return doc


@router.delete("/photos/{photo_id}", status_code=204, tags=["photos"])
async def delete_photo(photo_id: str, farm: str | None = None, db=Depends(get_db)):
    doc = await db.photos.find_one_and_delete({"farmName": farm or settings.farm_name, "id": photo_id})
    if doc is None:
        raise NotFound("photo not found")
    if doc.get("filePath") and os.path.exists(doc["filePath"]):
        os.unlink(doc["filePath"])
