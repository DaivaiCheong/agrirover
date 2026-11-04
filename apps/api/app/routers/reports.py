import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import CostEntry, CropProfile, Farm, Planting, Zone
from app.routers._deps import farm_dep
from app.services.clock import farm_today
from app.services.cop_report import build_cop

router = APIRouter(tags=["reports"])


@router.get("/reports/compare")
async def compare(a: str, b: str, today: date | None = None, farm: Farm = Depends(farm_dep),
                  session: AsyncSession = Depends(get_db)):
    """Two cycles side by side (for example the guided bed and the usual bed). Shows what was
    recorded and the difference. It does not say why the numbers differ."""
    day = today or farm_today()
    ra = await build_cop(session, farm, a, day)
    rb = await build_cop(session, farm, b, day)
    diff = None
    if ra["copPerKg"] is not None and rb["copPerKg"] is not None:
        diff = round(ra["copPerKg"] - rb["copPerKg"], 3)
    await session.commit()
    return {"a": ra, "b": rb, "copPerKgDifference": diff}


def _safe(value) -> str:
    """A cell a spreadsheet will not run as a formula, even if a farmer typed one."""
    if isinstance(value, (int, float)):
        return str(value)                                   # numbers we computed, not text a person typed
    s = "" if value is None else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _csv(rows: list[list], name: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in rows:
        w.writerow([_safe(c) for c in row])
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/export/costs.csv")
async def export_costs(farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(
        select(CostEntry, Zone.label, Zone.name, CropProfile.common_name)
        .outerjoin(Planting, CostEntry.planting_id == Planting.id)
        .outerjoin(Zone, Planting.zone_id == Zone.id)
        .outerjoin(CropProfile, Planting.crop_id == CropProfile.id)
        .where(CostEntry.farm_id == farm.id, CostEntry.deleted_at.is_(None))
        .order_by(CostEntry.entry_date, CostEntry.created_at))).all()
    out = [["date", "bed", "crop", "category", "description", "qty", "unit", "currency", "amount", "amount_usd", "source"]]
    for e, label, name, crop in rows:
        out.append([e.entry_date.isoformat(), (label or name) if name else "(whole farm)", crop or "", e.category,
                    e.description or "", "" if e.qty is None else f"{float(e.qty):g}", e.unit or "", e.currency,
                    f"{float(e.amount):.2f}", f"{float(e.amount_usd):.2f}", e.source])
    return _csv(out, "costs.csv")


@router.get("/export/cop.csv")
async def export_cop(today: date | None = None, farm: Farm = Depends(farm_dep),
                     session: AsyncSession = Depends(get_db)):
    day = today or farm_today()
    ids = (await session.execute(select(Planting.id).join(Zone, Planting.zone_id == Zone.id)
                                 .where(Zone.farm_id == farm.id).order_by(Planting.planted_on))).scalars().all()
    out = [["bed", "crop", "planted_on", "status", "total_cost_usd", "kg_marketable", "cop_per_kg_usd",
            "revenue_usd", "margin_usd", "cost_per_plant_usd", "cost_per_m2_usd", "notes"]]
    for pid in ids:
        r = await build_cop(session, farm, str(pid), day)
        c = r["cycle"]
        out.append([c["bedLabel"], c["cropName"], c["plantedOn"], c["status"], r["totalCostUsd"], r["kgMarketable"],
                    r["copPerKg"], r["revenueUsd"], r["marginUsd"], r["costPerPlant"], r["costPerM2"],
                    "; ".join(r["flags"])])
    await session.commit()
    return _csv(out, "cost-of-production.csv")
