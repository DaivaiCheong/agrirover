"""Survey missions for the rover (ROVER-01).

POST queues a mission by publishing it to the rover. Like a valve command, it
returns 202: the rover itself reports what happened — progress and the final
summary on devices/rover-01/mission/state (retained), the full report on
devices/rover-01/mission/result.
"""
import json
import uuid
from collections.abc import Awaitable, Callable

import aiomqtt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import settings

router = APIRouter(prefix="/missions", tags=["rover"])

ROVER = "rover-01"
TOPIC_MISSION_SET = f"devices/{ROVER}/mission/set"
MAX_CELLS = 400          # same limits the rover enforces on its side


class MissionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zone_id: str = Field(alias="zoneId", min_length=1, max_length=64)
    rows: int = Field(ge=1, le=40)
    cols: int = Field(ge=1, le=40)
    cell_m: float = Field(default=0.5, alias="cellM", ge=0.2, le=1.0)

    @model_validator(mode="after")
    def _not_too_big(self) -> "MissionIn":
        if self.rows * self.cols > MAX_CELLS:
            raise ValueError(f"at most {MAX_CELLS} cells per mission")
        return self


Publisher = Callable[[str, dict], Awaitable[None]]


async def mqtt_publish(topic: str, payload: dict) -> None:
    async with aiomqtt.Client(hostname=settings.mqtt_host, port=settings.mqtt_port,
                              username=settings.mqtt_username or None,
                              password=settings.mqtt_password or None) as client:
        await client.publish(topic, json.dumps(payload), qos=1)


def get_publisher() -> Publisher:
    return mqtt_publish


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_mission(body: MissionIn, publish: Publisher = Depends(get_publisher)):
    mission_id = str(uuid.uuid4())
    payload = {"missionId": mission_id, "zoneId": body.zone_id,
               "rows": body.rows, "cols": body.cols, "cellM": body.cell_m}
    try:
        await publish(TOPIC_MISSION_SET, payload)
    except Exception as exc:                          # noqa: BLE001
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "farm broker unreachable; mission not sent") from exc
    # TODO: persist a survey_mission row (status 'queued') once the DB session is wired.
    return {"missionId": mission_id, "status": "queued",
            "note": f"The rover reports progress on devices/{ROVER}/mission/state."}
