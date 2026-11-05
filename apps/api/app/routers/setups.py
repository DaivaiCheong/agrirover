from fastapi import APIRouter, Query

from app.services import guava

router = APIRouter(tags=["setups"])


@router.get("/setups")
async def list_setups(crop: str = "guava", area: float | None = Query(None, gt=0, le=1_000_000)):
    """The growing setups defined for a crop (density, yield per plant, suggested spacing, and the 50 m2
    benchmark), or an empty list for a crop that has none. Give `area` (m2) and each setup also says how
    many plants a bed that size takes."""
    return [s.to_dict(area) for s in guava.SETUPS] if crop == guava.SLUG else []
