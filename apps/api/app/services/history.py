"""A bed's readings over time, bucketed so a week of 10-second data is a hundred points, not sixty thousand."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Farm, Metric, SensorReading, Zone
from app.services.decisions import deciding_sensors
from app.services.errors import Invalid, NotFound
from app.services.metrics import SOIL_PROBE_METRICS, SPECS
from app.services.rule_engine import utcnow

MAX_HOURS = 24 * 14
MAX_METRICS = 12
MIN_BUCKET_S = 60


def parse_metrics(raw: str) -> list[Metric]:
    names = [n.strip() for n in raw.split(",") if n.strip()]
    if not names or len(names) > MAX_METRICS:
        raise Invalid(f"ask for between 1 and {MAX_METRICS} metrics")
    out: list[Metric] = []
    for n in names:
        try:
            m = Metric(n)
        except ValueError:
            raise Invalid(f"unknown metric {n!r}") from None
        if m not in out:
            out.append(m)
    return out


def bucket_seconds(hours: int, points: int) -> int:
    return max(MIN_BUCKET_S, math.ceil(hours * 3600 / max(1, points)))


async def series(session: AsyncSession, farm_name: str, zone_name: str, metrics: list[Metric], *,
                 hours: int = 24, points: int = 96, now: datetime | None = None) -> dict:
    """{"zone", "hours", "bucketSeconds", "from", "to", "series": {metric: [{"t": bucket start, "v": average}]}}.
    What the soil probe measures comes from the zone's deciding probe, as everywhere else."""
    if not 1 <= hours <= MAX_HOURS:
        raise Invalid(f"hours must be between 1 and {MAX_HOURS}")
    now = now or utcnow()
    farm = (await session.execute(select(Farm).where(Farm.name == farm_name))).scalar_one_or_none()
    zone = None if farm is None else (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id, Zone.name == zone_name))).scalar_one_or_none()
    if zone is None:
        raise NotFound(f"unknown bed {zone_name!r}")

    size = bucket_seconds(hours, points)
    since = now - timedelta(hours=hours)
    bucket = func.floor(extract("epoch", SensorReading.recorded_at) / size).label("bucket")
    query = (select(SensorReading.metric, bucket, func.avg(SensorReading.value))
             .where(SensorReading.zone_id == zone.id, SensorReading.metric.in_(metrics),
                    SensorReading.recorded_at >= since, SensorReading.recorded_at <= now)
             .group_by(SensorReading.metric, bucket).order_by(bucket))
    deciding = (await deciding_sensors(session, [zone.id])).get(zone.id)
    if deciding is not None:
        query = query.where(or_(SensorReading.metric.notin_(list(SOIL_PROBE_METRICS)),
                                SensorReading.sensor_id == deciding[0]))

    out: dict[str, list[dict]] = {m.value: [] for m in metrics}
    for metric, b, avg in (await session.execute(query)).all():
        t = datetime.fromtimestamp(int(b) * size, tz=timezone.utc)
        out[metric.value].append({"t": t.isoformat(), "v": round(float(avg), SPECS[metric].decimals + 1)})
    return {"zone": zone.name, "hours": hours, "bucketSeconds": size, "from": since.isoformat(),
            "to": now.isoformat(), "series": out}
