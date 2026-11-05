"""Simulated ESP8266 field node: publishes the same telemetry batch as
esp8266_field_node.ino to farm/{farm}/zone/{zone}/telemetry. No hardware.

    python sim_field_node.py --scenario dry --once
    python sim_field_node.py --scenario heat --probe 7in1 --interval 5

Scenarios: dry (moisture below the 30% irrigation threshold), wet (above it), rain (rain sensor wet),
heat, humid, salty (what the 7-in-1 probe and the air sensor see when they should raise an alert).
Broker comes from MQTT_HOST / MQTT_PORT / MQTT_USERNAME / MQTT_PASSWORD, like the rest of the stack.
Observation only: it never listens for valve commands.

Probes:
  basic  exactly what esp8266_field_node.ino publishes today (two moisture probes, water pH, rain, supply V)
  7in1   the upgraded node: the same, plus the 7-in-1 RS485 soil probe (pH, EC, temperature, N, P, K) and an
         ambient air sensor (temperature, humidity). The firmware for it is not written yet; this is the
         payload it must produce, in the units of the spec.
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
    "wet": ((66.0, 74.0), 0),               # above the 30 % valve rule and inside the 65-75 % seedling target
    "rain": ((66.0, 78.0), 1),             # rain wets the soil; the rule engine defers on the rain flag whatever the moisture
    "heat": ((58.0, 68.0), 0),
    "humid": ((62.0, 72.0), 0),
    "salty": ((60.0, 70.0), 0),
}

PROBES = ("basic", "7in1", "rain")      # rain: only what stays fixed in the field once the rover carries the soil probe

# 7-in-1 probe and air sensor: (low, high) per metric. Scenarios override what they are about.
HEALTHY = {
    "soil_ph": (6.2, 6.6), "soil_ec": (1.5, 1.8), "soil_temperature": (23.0, 25.5),
    "nitrogen": (115, 145), "phosphorus": (70, 95), "potassium": (170, 235),
    "air_temperature": (26.0, 28.5), "air_humidity": (64.0, 74.0),
}
OVERRIDES = {
    "rain": {"air_humidity": (86.0, 93.0), "air_temperature": (24.0, 26.0)},          # raining: humid and warm
    "heat": {"air_temperature": (33.0, 36.0), "air_humidity": (45.0, 55.0), "soil_temperature": (30.5, 33.0)},
    "humid": {"air_temperature": (25.0, 28.0), "air_humidity": (87.0, 94.0)},
    "salty": {"soil_ec": (4.2, 4.8), "soil_ph": (5.4, 5.7)},
}
# the units of the spec's payload
UNITS = {"soil_ph": "pH", "soil_ec": "mS/cm", "soil_temperature": "C", "nitrogen": "mg/kg", "phosphorus": "mg/kg",
         "potassium": "mg/kg", "air_temperature": "C", "air_humidity": "%"}
DECIMALS = {"soil_ph": 2, "soil_ec": 2, "soil_temperature": 1, "nitrogen": 0, "phosphorus": 0, "potassium": 0,
            "air_temperature": 1, "air_humidity": 1}


def telemetry_topic(farm: str, zone: str) -> str:
    return f"farm/{farm}/zone/{zone}/telemetry"


def probe_codes(zone: str) -> tuple[str, str]:
    """(shallow, deep) probe codes for a zone: zone-a -> S-A-10, S-A-25."""
    letter = zone.rsplit("-", 1)[-1].upper()
    return f"S-{letter}-10", f"S-{letter}-25"


def build_payload(scenario: str, rng: random.Random, device: str = "ESP-FIELD-01",
                  zone: str = "zone-a", probe: str = "basic") -> dict:
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}; choose from {sorted(SCENARIOS)}")
    if probe not in PROBES:
        raise ValueError(f"unknown probe {probe!r}; choose from {list(PROBES)}")
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

    payload = {
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
    if probe == "rain":
        payload["fw"] = "sim-rain-1.0"
        payload["measurements"] = [x for x in payload["measurements"] if x["metric"] != "soil_moisture"]
    if probe == "7in1":
        payload["fw"] = "sim-7in1-1.0"
        payload["zone"] = zone                                   # the spec's payload names its zone as well as the topic
        ranges = {**HEALTHY, **OVERRIDES.get(scenario, {})}
        for metric, (a, b) in ranges.items():                    # no probe code: the API files these under the deciding probe
            value = rng.uniform(a, b)
            payload["measurements"].append(m(metric, round(value, DECIMALS[metric]), UNITS[metric]))
    return payload


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
            payload = build_payload(args.scenario, rng, zone=args.zone, probe=args.probe)
            await client.publish(topic, json.dumps(payload), qos=1)
            n += 1
            deep = payload["measurements"][1]["value"]
            print(f"published {topic} {args.scenario}/{args.probe} deep-probe moisture={deep}", flush=True)
            if args.once or (args.count and n >= args.count):
                return
            await asyncio.sleep(args.interval)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--scenario", choices=sorted(SCENARIOS), default=os.getenv("SIM_SCENARIO", "dry"))
    p.add_argument("--probe", choices=PROBES, default=os.getenv("SIM_PROBE", "basic"),
                   help="basic = today's firmware; 7in1 = 7-in-1 soil probe + air sensor")
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
