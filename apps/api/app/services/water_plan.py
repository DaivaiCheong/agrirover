"""Water planner: how much water a crop needs each day of its life, and over the whole cycle.

Method (FAO Irrigation and Drainage Paper 56, single crop coefficient):

    ETc  = Kc(day) x ET0                         crop water need, mm per day
    1 mm of water over 1 m2 = 1 litre
    litres per plant per day = ETc x area per plant (m2)
    irrigation water (gross) = net / irrigation efficiency

Rain is NOT subtracted, so the figures are for a fully irrigated crop (an upper bound in
the wet season). ET0 depends on the place and the month and must be supplied.
Crops are data (the crop_profile table); TOMATO below is only the definition the seed loads.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

STAGES = ("initial", "development", "mid-season", "late season")


@dataclass(frozen=True)
class CropWater:
    id: str
    name: str
    kc_ini: float
    kc_mid: float
    kc_end: float
    stage_days: tuple[int, int, int, int]      # initial, development, mid-season, late season
    source: str


TOMATO = CropWater(
    id="tomato", name="Tomato", kc_ini=0.6, kc_mid=1.15, kc_end=0.80, stage_days=(30, 40, 40, 25),
    source=("FAO-56 Tables 11-12. Stage lengths: the 'Arid Region' row (30/40/40/25 = 135 days); FAO lists "
            "other rows from 135 to 180 days. Kc mid 1.15 (FAO suggests up to 1.20 for staked tomatoes). "
            "Kc end 0.80, the midpoint of FAO's 0.70-0.90. Kc ini 0.6 is the Solanaceae-row value. "
            "Check stage lengths against your own variety."),
)


@dataclass(frozen=True)
class DayRow:
    day: int                            # 1 = the planting day
    stage: str
    kc: float
    etc_mm: float
    liters_per_plant_net: float
    liters_per_plant_gross: float
    liters_total_gross: float


@dataclass(frozen=True)
class WaterPlan:
    crop: CropWater
    plants: int
    area_per_plant_m2: float
    et0_mm_day: float
    efficiency: float
    stage_days: tuple[int, int, int, int]
    days: list[DayRow]
    net_m3: float
    gross_m3: float
    peak_liters_per_day: float

    @property
    def cycle_days(self) -> int:
        return len(self.days)


def _stage_days(crop: CropWater, stage_days) -> tuple[int, int, int, int]:
    sd = tuple(stage_days) if stage_days is not None else crop.stage_days
    if len(sd) != 4 or any(int(x) != x or x < 1 for x in sd):
        raise ValueError("stage_days must be four whole numbers of days, each at least 1")
    return tuple(int(x) for x in sd)               # type: ignore[return-value]


def kc_for_day(crop: CropWater, day: int, stage_days=None) -> float:
    """FAO-56 Kc curve: flat, rising line, flat, falling line."""
    l_ini, l_dev, l_mid, l_late = _stage_days(crop, stage_days)
    if not 1 <= day <= l_ini + l_dev + l_mid + l_late:
        raise ValueError(f"day {day} is outside the crop cycle")
    if day <= l_ini:
        return crop.kc_ini
    if day <= l_ini + l_dev:
        return crop.kc_ini + (day - l_ini) / l_dev * (crop.kc_mid - crop.kc_ini)
    if day <= l_ini + l_dev + l_mid:
        return crop.kc_mid
    return crop.kc_mid + (day - l_ini - l_dev - l_mid) / l_late * (crop.kc_end - crop.kc_mid)


def stage_for_day(crop: CropWater, day: int, stage_days=None) -> str:
    sd = _stage_days(crop, stage_days)
    if not 1 <= day <= sum(sd):
        raise ValueError(f"day {day} is outside the crop cycle")
    edge = 0
    for name, length in zip(STAGES, sd):
        edge += length
        if day <= edge:
            return name
    raise AssertionError("unreachable")


def plan(crop: CropWater, plants: int, area_per_plant_m2: float, et0_mm_day: float,
         efficiency: float, stage_days=None) -> WaterPlan:
    if plants < 1:
        raise ValueError("plants must be at least 1")
    if area_per_plant_m2 <= 0:
        raise ValueError("area per plant must be above 0")
    if et0_mm_day <= 0:
        raise ValueError("ET0 must be above 0")
    if not 0 < efficiency <= 1:
        raise ValueError("efficiency must be above 0 and at most 1")
    sd = _stage_days(crop, stage_days)

    days: list[DayRow] = []
    for d in range(1, sum(sd) + 1):
        kc = kc_for_day(crop, d, sd)
        etc = kc * et0_mm_day
        net = etc * area_per_plant_m2                  # litres per plant
        gross = net / efficiency
        days.append(DayRow(day=d, stage=stage_for_day(crop, d, sd), kc=kc, etc_mm=etc,
                           liters_per_plant_net=net, liters_per_plant_gross=gross,
                           liters_total_gross=gross * plants))
    net_m3 = sum(r.liters_per_plant_net for r in days) * plants / 1000
    return WaterPlan(crop=crop, plants=plants, area_per_plant_m2=area_per_plant_m2, et0_mm_day=et0_mm_day,
                     efficiency=efficiency, stage_days=sd, days=days, net_m3=net_m3,
                     gross_m3=net_m3 / efficiency,
                     peak_liters_per_day=max(r.liters_total_gross for r in days))


def m3_through(p: WaterPlan, day: int) -> float:
    """Irrigation water (gross) used from day 1 up to and including `day`, in m3. Used for an open cycle."""
    return sum(r.liters_total_gross for r in p.days[:max(0, day)]) / 1000


def crop_day(planted_on: date, today: date) -> int:
    """Day of the crop's life; the planting day is day 1. Before planting this is 0 or less."""
    return (today - planted_on).days + 1


def position(p: WaterPlan, planted_on: date, today: date) -> DayRow | None:
    """The plan row for `today`, or None when the crop is not planted yet or the cycle is over."""
    d = crop_day(planted_on, today)
    return p.days[d - 1] if 1 <= d <= p.cycle_days else None
