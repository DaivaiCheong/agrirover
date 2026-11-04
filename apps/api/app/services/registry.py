"""Read models for the web UI: device registry and the latest readings per zone."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Device, Farm, Zone
from app.services.decisions import latest_signal, newest_readings
from app.services.rule_engine import utcnow

STALE_AFTER_INTERVALS = 3        # silent for 3 expected intervals -> stale


def device_status(last_seen_at: datetime | None, expected_interval_s: int,
                  commissioned: bool, now: datetime) -> str:
    if not commissioned:
        return "not_commissioned"
    if last_seen_at is None:
        return "never"
    silent = now - last_seen_at
    return "online" if silent <= timedelta(seconds=STALE_AFTER_INTERVALS * expected_interval_s) else "stale"


async def list_devices(session: AsyncSession, now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    rows = (await session.execute(
        select(Device, Zone.name).outerjoin(Zone, Device.zone_id == Zone.id).order_by(Device.code))).all()
    return [{
        "code": d.code, "kind": d.kind.value, "zone": zone_name, "commissioned": d.commissioned,
        "status": device_status(d.last_seen_at, d.expected_interval_s, d.commissioned, now),
        "lastSeenAt": d.last_seen_at.isoformat() if d.last_seen_at else None,
        "firmwareVersion": d.firmware_version,
    } for d, zone_name in rows]


async def latest_by_zone(session: AsyncSession, farm_name: str) -> list[dict]:
    farm = (await session.execute(select(Farm).where(Farm.name == farm_name))).scalar_one_or_none()
    if farm is None:
        return []
    zones = (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id).order_by(Zone.name))).scalars().all()
    by_zone = await newest_readings(session, [z.id for z in zones])

    out = []
    for z in zones:
        rows = by_zone.get(z.id, [])
        moisture, _ = latest_signal(rows)
        newest = {metric: value for metric, value, _ in rows}
        latest_at = max((at for _, _, at in rows), default=None)
        out.append({
            "zone": z.name,
            "label": z.label,
            "areaM2": z.area_m2,
            "moisturePct": moisture,
            "rain": bool(newest["rain"]) if "rain" in newest else None,
            "supplyVoltage": newest.get("supply_voltage"),
            "waterPh": newest.get("water_ph"),
            "recordedAt": latest_at.isoformat() if latest_at else None,
        })
    return out
