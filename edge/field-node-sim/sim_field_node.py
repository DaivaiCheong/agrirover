"""Simulated ESP8266 field node: publishes the same telemetry batch as
esp8266_field_node.ino to farm/{farm}/zone/{zone}/telemetry. No hardware.

    python sim_field_node.py --scenario dry --once
    python sim_field_node.py --scenario rain --interval 5

Scenarios: dry (moisture below the 30% irrigation threshold), wet (above it),
rain (rain sensor wet). Broker comes from MQTT_HOST / MQTT_PORT / MQTT_USERNAME /
MQTT_PASSWORD, like the rest of the stack. Observation only: it never listens
for valve commands.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random

import aiomqtt

# (moisture low, high) %, rain flag
SCENARIOS = {
    "dry": ((15.0, 27.0), 0),
    "wet": ((48.0, 60.0), 0),
    "rain": ((38.0, 50.0), 1),
}


def telemetry_topic(farm: str, zone: str) -> str:
    return f"farm/{farm}/zone/{zone}/telemetry"


def probe_codes(zone: str) -> tuple[str, str]:
    """(shallow, deep) probe codes for a zone: zone-a -> S-A-10, S-A-25."""
    letter = zone.rsplit("-", 1)[-1].upper()
    return f"S-{letter}-10", f"S-{letter}-25"


def build_payload(scenario: str, rng: random.Random, device: str = "ESP-FIELD-01",
                  zone: str = "zone-a") -> dict:
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}; choose from {sorted(SCENARIOS)}")
    (lo, hi), rain = SCENARIOS[scenario]
    shallow_code, deep_code = probe_codes(zone)
    deep = rng.uniform(lo, hi)
    # the surface moves faster than the root zone, so the shallow probe differs from the deep one
    shallow = min(100.0, max(0.0, deep + rng.uniform(-8, 8)))

    def m(metric: str, value: float, unit: str, quality: str = "valid", sensor: str | None = None) -> dict:
        item = {"metric": metric, "value": value, "unit": unit, "quality": quality}
        if sensor:
            item["sensor"] = sensor
        return item

    return {
        "device": device,
        "fw": "sim-1.0",
        "sampleCount": 16,
        "rssi": rng.randint(-72, -55),
        "measurements": [
            m("soil_moisture", round(shallow, 1), "pct", sensor=shallow_code),
            m("soil_moisture", round(deep, 1), "pct", sensor=deep_code),
            m("water_ph", round(rng.uniform(6.2, 7.0), 2), "pH", "uncalibrated"),
            m("rain", rain, "bool"),
            m("supply_voltage", round(rng.uniform(4.9, 5.1), 2), "V"),
        ],
    }


async def run(args: argparse.Namespace) -> None:
    rng = random.Random(args.seed)
    topic = telemetry_topic(args.farm, args.zone)
    async with aiomqtt.Client(
        hostname=args.host, port=args.port,
        username=os.getenv("MQTT_USERNAME") or None,
        password=os.getenv("MQTT_PASSWORD") or None,
    ) as client:
        n = 0
        while True:
            payload = build_payload(args.scenario, rng, zone=args.zone)
            await client.publish(topic, json.dumps(payload), qos=1)
            n += 1
            deep = payload["measurements"][1]["value"]
            print(f"published {topic} {args.scenario} deep-probe moisture={deep}", flush=True)
            if args.once or (args.count and n >= args.count):
                return
            await asyncio.sleep(args.interval)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--scenario", choices=sorted(SCENARIOS), default=os.getenv("SIM_SCENARIO", "dry"))
    p.add_argument("--host", default=os.getenv("MQTT_HOST", "localhost"))
    p.add_argument("--port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    p.add_argument("--farm", default=os.getenv("SIM_FARM", "farm-01"))
    p.add_argument("--zone", default=os.getenv("SIM_ZONE", "zone-a"))
    p.add_argument("--interval", type=float, default=float(os.getenv("SIM_INTERVAL", "10")))
    p.add_argument("--count", type=int, default=0, help="stop after N messages (0 = forever)")
    p.add_argument("--once", action="store_true")
    p.add_argument("--seed", type=int, default=None)
    asyncio.run(run(p.parse_args()))


if __name__ == "__main__":
    main()
