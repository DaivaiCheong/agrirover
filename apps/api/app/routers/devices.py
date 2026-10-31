from fastapi import APIRouter

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("")
async def list_devices():
    return [
        {"code": "PI-CORE-01",   "kind": "pi_core",    "commissioned": True},
        {"code": "ESP-FIELD-01", "kind": "field_node", "commissioned": True},
        {"code": "ROVER-01",     "kind": "rover",      "commissioned": False},
    ]
