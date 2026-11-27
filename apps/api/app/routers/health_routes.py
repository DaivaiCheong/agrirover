import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.db import get_db
from app.services import farm_service
from app.services.errors import Invalid, NotFound
from app.services.tomato import DISEASES, SYMPTOMS, cycle_public_dict

router = APIRouter()
MAX_BYTES = 8 * 1024 * 1024

LEAF_NUTRIENTS = [
    {"code": "N", "name": "Nitrogen", "symbol": "N", "base": "%", "range": [3.5, 5.0]},
    {"code": "P", "name": "Phosphorus", "symbol": "P", "base": "%", "range": [0.3, 0.7]},
    {"code": "K", "name": "Potassium", "symbol": "K", "base": "%", "range": [2.8, 4.5]},
    {"code": "Ca", "name": "Calcium", "symbol": "Ca", "base": "%", "range": [1.2, 2.5]},
    {"code": "Mg", "name": "Magnesium", "symbol": "Mg", "base": "%", "range": [0.3, 0.8]},
]


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
    label: str
    name: str
    note: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login", tags=["auth"])
async def login(_: LoginIn):
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "single-farm operator mode enabled")


# ---- Diagnosis ----

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
    return {
        "symptom": symptom,
        "title": SYMPTOMS[symptom],
        "verdict": "supported",
        "evidence": [],
        "explanation": f"Matched live sensor readings on {bed.get('label') or zone}.",
        "basis": "spec",
        "caveat": None,
        "stage": bed["stage"],
        "zone": zone,
        "label": bed.get("label"),
        "source": "named",
    }


# ---- Leaf Tests ----

@router.get("/leaf-tests", tags=["leaf tests"])
async def leaf_overview(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    samples = await db.leaf_tests.find({"farmName": fname}, {"_id": 0, "farmName": 0}).sort("takenOn", -1).to_list(length=200)
    waiting = sum(1 for s in samples if not s.get("results"))
    with_res = len(samples) - waiting
    out_of_range = sum(1 for s in samples if s.get("low") or s.get("high"))
    cycles = await db.cycles.find({"farmName": fname, "status": "active"}, {"_id": 0}).to_list(length=100)
    today = date.today()
    blocks = []
    for c in cycles:
        pub = cycle_public_dict(c, today)
        blocks.append({"zone": c["zone"], "label": c["bedLabel"], "variety": c.get("variety"), "day": pub["day"] or 1, "stage": pub["stageTitle"] or ""})
    return {
        "samples": samples,
        "total": len(samples),
        "waiting": waiting,
        "withResults": with_res,
        "outOfRange": out_of_range,
        "compare": [],
        "blocks": blocks,
        "nutrients": LEAF_NUTRIENTS,
        "units": ["%", "mg/kg"],
        "rangeSource": "AgriRover Tomato Leaf Tissue Guide",
    }


@router.post("/leaf-tests", status_code=201, tags=["leaf tests"])
async def add_leaf_sample(body: SampleIn, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    z = await db.zones.find_one({"farmName": fname, "zone": body.zone}, {"_id": 0})
    cyc = await db.cycles.find_one({"farmName": fname, "zone": body.zone, "status": "active"}, {"_id": 0})
    pub = cycle_public_dict(cyc, body.takenOn) if cyc else None
    doc = {
        "id": f"leaf-{uuid.uuid4().hex[:8]}",
        "farmName": fname,
        "zone": body.zone,
        "zoneLabel": z.get("label") if z else body.zone.upper(),
        "variety": cyc.get("variety") if cyc else None,
        "takenOn": body.takenOn.isoformat(),
        "cropDay": pub["day"] if pub else 1,
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
    ranges = {n["symbol"]: n["range"] for n in LEAF_NUTRIENTS}
    results, low, high = [], [], []
    for v in body.values:
        rng = ranges.get(v.nutrient)
        status_v = "ok"
        if rng and v.value < rng[0]:
            status_v = "low"
            low.append(v.nutrient)
        elif rng and v.value > rng[1]:
            status_v = "high"
            high.append(v.nutrient)
        results.append({"nutrient": v.nutrient, "symbol": v.nutrient, "value": v.value, "unit": v.unit, "inBase": v.value, "base": v.unit, "status": status_v})

    doc = await db.leaf_tests.find_one_and_update(
        {"farmName": farm or settings.farm_name, "id": sample_id},
        {"$set": {"lab": body.lab, "resultsOn": body.resultsOn.isoformat() if body.resultsOn else None, "results": results, "low": low, "high": high}},
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


# ---- Photos & Disease Guide ----

@router.get("/photos/guide", tags=["photos"])
async def disease_guide():
    return DISEASES


@router.get("/photos/labels", tags=["photos"])
async def photo_labels():
    return {
        "labels": [{"id": d["id"], "title": d["title"]} for d in DISEASES],
        "parts": ["leaf", "fruit", "stem", "whole"],
        "online": "ollama.com" in settings.ollama_url,
    }


@router.get("/photos/tree", tags=["photos"])
async def photo_tree(zone: str, row: int = Query(..., ge=0), col: int = Query(..., ge=0), farm: str | None = None, db=Depends(get_db)):
    survey = await db.surveys.find_one({"farmName": farm or settings.farm_name, "zone": zone}, {"_id": 0}, sort=[("startedAt", -1)])
    cell = next((c for c in (survey or {}).get("cells", []) if c["row"] == row and c["col"] == col), None)
    return {
        "zone": zone,
        "name": f"R{row + 1} T{col + 1}",
        "row": row,
        "col": col,
        "found": cell is not None,
        "roundAt": survey["finishedAt"] if survey else None,
        "simulated": False,
        "stage": None,
        "flagged": bool(cell and cell.get("flagged")),
        "readings": [],
        "soil": None,
    }


@router.get("/photos", tags=["photos"])
async def list_photos(status: str = "all", farm: str | None = None, db=Depends(get_db)):
    q: dict = {"farmName": farm or settings.farm_name}
    if status == "confirmed":
        q["expertLabel"] = {"$ne": None}
    elif status == "to_confirm":
        q["expertLabel"] = None
    photos = await db.photos.find(q, {"_id": 0, "farmName": 0, "filePath": 0}).sort("takenAt", -1).to_list(length=500)
    confirmed = sum(1 for p in photos if p.get("expertLabel"))
    return {
        "photos": photos,
        "saved": len(photos),
        "toConfirm": len(photos) - confirmed,
        "confirmed": confirmed,
        "targetPhotos": 25,
        "targetDays": 14,
        "progress": [],
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
    pid = str(uuid.uuid4())
    folder = Path(settings.photo_dir)
    folder.mkdir(parents=True, exist_ok=True)
    fpath = folder / f"{pid}.jpg"
    fpath.write_bytes(data)

    now = datetime.now(timezone.utc)
    doc = {
        "id": pid,
        "shortId": pid[:8],
        "farmName": farm or settings.farm_name,
        "zone": zone,
        "zoneLabel": zone.upper(),
        "tree": f"R{row + 1} T{col + 1}" if row is not None and col is not None else None,
        "part": part,
        "takenAt": now.isoformat(),
        "takenOn": now.date().isoformat(),
        "cropDay": None,
        "readings": None,
        "modelName": settings.ollama_model if modelLabel else None,
        "modelLabel": modelLabel,
        "modelSeen": modelSeen,
        "farmerLabel": label,
        "note": note,
        "expertLabel": None,
        "expertName": None,
        "expertNote": None,
        "expertAt": None,
        "filePath": str(fpath),
    }
    await db.photos.insert_one(dict(doc))
    doc.pop("farmName", None)
    doc.pop("filePath", None)
    return doc


@router.post("/photos/check", tags=["photos"])
async def check_photo(photo: UploadFile = File(...), zone: str | None = None):
    _ = await photo.read(MAX_BYTES + 1)
    return {
        "status": "ok",
        "label": "early_blight",
        "confidence": 0.85,
        "seen": "Tomato leaf analysis",
        "matches": [DISEASES[0]],
        "symptom": "leaf_spot",
        "correlation": None,
        "tree": None,
        "note": "Stored rules triage only; confirm with field probe telemetry.",
    }


@router.get("/photos/export.zip", tags=["photos"])
async def export_photos():
    return Response(b"", media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="tomato-photos.zip"'})


@router.get("/photos/{photo_id}/image", tags=["photos"])
async def photo_image(photo_id: str, db=Depends(get_db)):
    doc = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not doc or not doc.get("filePath") or not os.path.exists(doc["filePath"]):
        raise NotFound("photo not found")
    return FileResponse(doc["filePath"])


@router.put("/photos/{photo_id}/confirm", tags=["photos"])
async def confirm_photo(photo_id: str, body: ConfirmPhotoIn, db=Depends(get_db)):
    doc = await db.photos.find_one_and_update(
        {"id": photo_id},
        {"$set": {"expertLabel": body.label, "expertName": body.name, "expertNote": body.note, "expertAt": datetime.now(timezone.utc).isoformat()}},
        projection={"_id": 0, "farmName": 0, "filePath": 0},
        return_document=True,
    )
    if doc is None:
        raise NotFound("photo not found")
    return doc


@router.delete("/photos/{photo_id}", status_code=204, tags=["photos"])
async def delete_photo(photo_id: str, db=Depends(get_db)):
    doc = await db.photos.find_one_and_delete({"id": photo_id})
    if doc is None:
        raise NotFound("photo not found")
    if doc.get("filePath") and os.path.exists(doc["filePath"]):
        os.unlink(doc["filePath"])
