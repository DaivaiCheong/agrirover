import os
import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.services import diagnosis, photo_library, tree_check
from app.services.disease import Classifier, ModelUnavailable, get_classifier
from app.services.guava_diseases import BY_ID, DISEASES

router = APIRouter(prefix="/photos", tags=["photos"])

MAX_BYTES = 8 * 1024 * 1024
NOTE = "Triage only, not a diagnosis. Have a plant specialist confirm before treating."


def _is_image(data: bytes) -> bool:
    """JPEG or PNG by content, not by file name."""
    return data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")


async def _read_image(photo: UploadFile) -> bytes:
    data = await photo.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "photo is larger than 8 MB")
    if not _is_image(data):
        raise HTTPException(415, "send a JPEG or PNG photo")
    return data


async def _tree(session: AsyncSession, zone: str | None, row: int | None, col: int | None) -> dict | None:
    if row is None and col is None:
        return None
    if zone is None or row is None or col is None:
        raise HTTPException(422, "give the block, the row and the tree together")
    return await tree_check.tree_context(session, settings.farm_name, zone, row, col)


@router.get("/tree")
async def tree(zone: str, row: int = Query(..., ge=0), col: int = Query(..., ge=0), session: AsyncSession = Depends(get_db)):
    """One tree as the rover last found it: its soil against the stage's targets, and what that says about yellow leaves.
    Row and tree count from 0."""
    return await _tree(session, zone, row, col)


@router.post("/check")
async def check_photo(photo: UploadFile = File(...), zone: str | None = None,
                      row: int | None = Query(None, ge=0), col: int | None = Query(None, ge=0),
                      classifier: Classifier | None = Depends(get_classifier),
                      session: AsyncSession = Depends(get_db)):
    """Check one plant photo. The image is not stored here: saving it is a separate choice. Say which bed it is from
    (`zone`) and a symptom the farm has a rule for is set against that bed's soil and air readings. Say which tree too
    (`row`, `col`, from 0) and the answer carries that tree's own readings from the newest round."""
    tree_ctx = await _tree(session, zone, row, col)        # checked first: a wrong tree should not cost a model call
    data = await _read_image(photo)
    if classifier is None:
        raise HTTPException(503, "disease model not installed")
    try:
        result = await run_in_threadpool(classifier.classify, data)
    except ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    if result is None:
        return {"status": "uncertain", "label": None, "confidence": None, "seen": None, "matches": [], "symptom": None, "correlation": None,
                "tree": tree_ctx, "note": "The model is not sure. Take a clearer, closer photo of one leaf or fruit. " + NOTE}
    matches = [BY_ID[x].to_dict() for x in (result.label, result.also) if x in BY_ID]
    # the soil check is offered for the best match only: picking the runner-up's rule put "Guava rust" under a brown-spot photo
    symptom = (matches[0]["symptom"] if matches else None) or diagnosis.match_symptom(result.label)
    correlation = None
    # Only a model with measured accuracy may run the soil check by itself. Otherwise a person compares the matches and chooses.
    if zone and symptom and result.confidence is not None:
        correlation = {**await diagnosis.diagnose(session, settings.farm_name, zone, symptom), "source": "photo"}
    confidence = None if result.confidence is None else round(float(result.confidence), 3)
    return {"status": "ok", "label": result.label, "confidence": confidence, "seen": result.seen, "matches": matches, "symptom": symptom,
            "correlation": correlation, "tree": tree_ctx, "note": NOTE}


@router.get("/guide")
async def disease_guide():
    """The guava disease guide: what the photo AI reads, for a farmer to read too."""
    return [d.to_dict() for d in DISEASES]


@router.get("/labels")
async def labels():
    """The words a photo can be labelled with, the parts of a tree it can show, and whether a check sends the photo online."""
    return {"labels": [{"id": k, "title": v} for k, v in photo_library.LABELS.items()], "parts": list(photo_library.PARTS),
            "online": "ollama.com" in settings.ollama_url}


@router.post("", status_code=201)
async def save_photo(photo: UploadFile = File(...), zone: str = Form(...), part: str = Form("leaf"), row: int | None = Form(None), col: int | None = Form(None),
                     label: str | None = Form(None), note: str | None = Form(None), modelLabel: str | None = Form(None), modelSeen: str | None = Form(None),
                     session: AsyncSession = Depends(get_db)):
    """Keep a photo for an expert to confirm. `row` and `col` count from 0."""
    data = await _read_image(photo)
    return await photo_library.save(session, data, zone_name=zone, part=part, row=row, col=col, farmer_label=label, note=note,
                                    model_name=settings.ollama_model if modelLabel else None, model_label=modelLabel, model_seen=modelSeen)


@router.get("")
async def list_photos(status: str = "all", session: AsyncSession = Depends(get_db)):
    return await photo_library.library(session, status)


@router.get("/export.zip")
async def export(background: BackgroundTasks, status: Literal["confirmed", "to_confirm"] = "confirmed", session: AsyncSession = Depends(get_db)):
    """`confirmed`: a folder per expert label, ready to score a model. `to_confirm`: the photos and a sheet to send an expert."""
    path = await photo_library.export_zip(session, status)
    background.add_task(os.unlink, path)
    return FileResponse(path, media_type="application/zip", filename=f"guava-photos-{status}.zip", background=background)


@router.get("/{photo_id}/image")
async def photo_image(photo_id: uuid.UUID, session: AsyncSession = Depends(get_db)):
    photo = await photo_library.get(session, photo_id)
    path = os.path.join(settings.photo_dir, photo.filename)
    if not os.path.exists(path):
        raise HTTPException(404, "the photo's file is missing")
    return FileResponse(path, media_type="image/png" if photo.filename.endswith(".png") else "image/jpeg")


class Confirm(BaseModel):
    label: str
    name: str = Field(min_length=1, max_length=80)
    note: str | None = None


@router.put("/{photo_id}/confirm")
async def confirm_photo(photo_id: uuid.UUID, body: Confirm, session: AsyncSession = Depends(get_db)):
    """An expert says what the photo shows. Only this label may train or test a model."""
    return await photo_library.confirm(session, photo_id, label=body.label, name=body.name, note=body.note)


@router.delete("/{photo_id}", status_code=204)
async def delete_photo(photo_id: uuid.UUID, session: AsyncSession = Depends(get_db)):
    await photo_library.delete(session, photo_id)
