from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.services.decisions import ZoneDecision


class ZoneDecisionOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    zone: str
    decision: str
    text: str
    duration_seconds: int
    reason: str
    moisture_pct: float | None
    threshold_pct: float | None        # the bed's watering rule waters below this; the stage targets are a separate matter
    decision_at: datetime

    @classmethod
    def from_decision(cls, d: ZoneDecision) -> "ZoneDecisionOut":
        return cls(zone=d.zone, decision=d.decision.value, text=d.text,
                   duration_seconds=round(d.duration_ms / 1000), reason=d.reason,
                   moisture_pct=d.moisture_pct, threshold_pct=d.inputs.get("threshold_pct"),
                   decision_at=d.decision_at)
