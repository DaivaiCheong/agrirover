from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.services import diagnosis
from app.services.disease import Classifier, get_classifier

router = APIRouter(prefix="/photos", tags=["photos"])

MAX_BYTES = 8 * 1024 * 1024
NOTE = "Triage only, not a diagnosis. Have a plant specialist confirm before treating."


def _is_image(data: bytes) -> bool:
    """JPEG or PNG by content, not by file name."""
    return data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")


@router.post("/check")
async def check_photo(photo: UploadFile = File(...), zone: str | None = None,
                      classifier: Classifier | None = Depends(get_classifier),
                      session: AsyncSession = Depends(get_db)):
    """Check one plant photo. Stateless: the image is not stored. Say which bed it is from (`zone`) and a
    symptom the farm has a rule for is set against that bed's live soil and air readings."""
    data = await photo.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "photo is larger than 8 MB")
    if not _is_image(data):
        raise HTTPException(415, "send a JPEG or PNG photo")
    if classifier is None:
        raise HTTPException(503, "disease model not installed")
    result = await run_in_threadpool(classifier.classify, data)
    if result is None:
        return {"status": "uncertain", "label": None, "confidence": None, "symptom": None, "correlation": None,
                "note": "The model is not confident. Take a clearer, closer photo of one leaf. " + NOTE}
    label, confidence = result
    symptom = diagnosis.match_symptom(label)
    correlation = None
    if zone and symptom:
        correlation = {**await diagnosis.diagnose(session, settings.farm_name, zone, symptom), "source": "photo"}
    return {"status": "ok", "label": label, "confidence": round(float(confidence), 3), "symptom": symptom,
            "correlation": correlation, "note": NOTE}
