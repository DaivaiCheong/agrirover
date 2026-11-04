"""Growing setups: how a tomato bed is run, and what that should yield.

Three setups from the farm's own benchmark table (2026-11-04), each for a 50 m2 bed:

  setup                    plants / m2   plants   kg / plant   expected harvest
  Standard open field      2.0 - 2.5     100-125  2.5 - 4.0    250 - 500 kg
  Intensive raised bed     2.5 - 3.0     125-150  4.0 - 5.0    500 - 750 kg
  Net-house / greenhouse   3.0 - 3.5     150-175  6.0 - 8.0    900 - 1,400 kg

Density and yield are the owner's benchmarks ("spec"), not figures checked against a study here. The net-house
yield sits inside the Aomori greenhouse growers' 5.4-8.8 kg per plant that crop_guide.py already cites; nothing
in the sources read so far gives open-field yield in Cambodia. The row and plant spacings are ours ("practice"):
the nearest round spacing that lands inside the density range, so that picking a setup can fill the spacing.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.errors import Invalid

REFERENCE_BED_M2 = 50
BASIS = "spec"
SPACING_BASIS = "practice"


@dataclass(frozen=True)
class Setup:
    id: str
    label: str
    method: str | None
    density: tuple[float, float]               # plants per m2
    kg_per_plant: tuple[float, float]
    row_cm: int                                # suggested spacing, inside `density`
    plant_cm: int

    @property
    def spacing_density(self) -> float:
        return 10_000 / (self.row_cm * self.plant_cm)

    @property
    def mid_density(self) -> float:
        return sum(self.density) / 2

    def plants_for_area(self, area_m2: float) -> int:
        """The plant count a bed of this size takes at the middle of the density range."""
        return max(1, int(area_m2 * self.mid_density + 0.5))

    def forecast(self, plants: int, price_usd_per_kg: float | None = None) -> dict:
        """Expected harvest of `plants` plants: low = lowest yield per plant, high = highest."""
        lo, hi = round(plants * self.kg_per_plant[0], 1), round(plants * self.kg_per_plant[1], 1)
        out = {"setup": self.id, "label": self.label, "plants": plants, "kgLow": lo, "kgHigh": hi,
               "kgMid": round((lo + hi) / 2, 1), "pricePerKgUsd": price_usd_per_kg,
               "revenueLowUsd": None, "revenueHighUsd": None, "basis": BASIS}
        if price_usd_per_kg is not None:
            out["revenueLowUsd"], out["revenueHighUsd"] = round(lo * price_usd_per_kg, 2), round(hi * price_usd_per_kg, 2)
        return out

    def to_dict(self, area_m2: float | None = None) -> dict:
        """The setup as the API shows it. Given a bed's area, it also says how many plants that bed takes."""
        lo_n, hi_n = (round(REFERENCE_BED_M2 * d) for d in self.density)
        return {"id": self.id, "label": self.label, "method": self.method,
                "plantsForArea": self.plants_for_area(area_m2) if area_m2 else None,
                "density": list(self.density), "kgPerPlant": list(self.kg_per_plant),
                "referenceBedM2": REFERENCE_BED_M2, "plantsPerReferenceBed": [lo_n, hi_n],
                "kgPerReferenceBed": [round(lo_n * self.kg_per_plant[0]), round(hi_n * self.kg_per_plant[1])],
                "rowCm": self.row_cm, "plantCm": self.plant_cm, "spacingPlantsPerM2": round(self.spacing_density, 2),
                "basis": BASIS, "spacingBasis": SPACING_BASIS}


SETUPS: dict[str, tuple[Setup, ...]] = {
    "tomato": (
        Setup("open_field", "Standard open field", None, (2.0, 2.5), (2.5, 4.0), row_cm=100, plant_cm=45),
        Setup("raised_bed", "Intensive raised bed", "Drip, mulch and staking", (2.5, 3.0), (4.0, 5.0),
              row_cm=90, plant_cm=40),
        Setup("net_house", "Net-house or greenhouse", "Indeterminate varieties on a trellis", (3.0, 3.5), (6.0, 8.0),
              row_cm=80, plant_cm=40),
    ),
}


def for_crop(slug: str | None) -> tuple[Setup, ...]:
    return SETUPS.get(slug or "", ())


def get(slug: str | None, setup_id: str | None) -> Setup | None:
    return next((s for s in for_crop(slug) if s.id == setup_id), None)


def check(slug: str | None, setup_id: str | None) -> None:
    """Raise Invalid unless `setup_id` is empty or one of the setups defined for this crop."""
    if setup_id is None:
        return
    if not for_crop(slug):
        raise Invalid(f"growing setups are only defined for tomato, not for {slug!r}")
    if get(slug, setup_id) is None:
        raise Invalid(f"unknown growing setup {setup_id!r}; choose one of {', '.join(s.id for s in for_crop(slug))}")
