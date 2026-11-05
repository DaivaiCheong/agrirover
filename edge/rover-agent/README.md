# Rover agent

Runs on the rover's Raspberry Pi. Design and safety: [docs/architecture/rover.md](../../docs/architecture/rover.md).

```bash
pip install -r requirements.txt
python -m pytest                          # no hardware needed

python -m rover sim                       # simulated block of 4 rows of 10 trees -> reports/<mission>/
python -m rover sim --rows 6 --cols 12 --seed 3
python -m rover sim --battery 11.15       # low-battery guard stops the rover mid-block
```

Each round writes `report.json`, `field-map.svg` and `camera-frames.png`.

## On the rover

```bash
pip install -r requirements.txt pyserial
export MQTT_HOST=<farm server IP> ROVER_SERIAL_PORT=/dev/ttyUSB0
python -m rover run                       # Pi camera; add --usb-camera for a webcam
```

Without hardware, against a real broker: `python -m rover run --sim-hardware`
(or `docker compose --profile sim up` from the repository root).

| Module | Does |
|---|---|
| `planner.py` | Serpentine coverage path and the turns / moves between cells |
| `probe.py` | The soil probe and air sensor at each tree. The real RS485 reader is not written |
| `vision.py` | Leaf cover and yellowing per photo; optional TFLite disease model |
| `mission.py` | Runs a survey; checks the guards before every move; builds the report |
| `safety.py` | Guards (e-stop, rain, battery, link) and command clamps |
| `drive.py` | `SimDrive` and `SerialDrive` (motor controller over USB) |
| `protocol.py` | Serial frames, shared with the firmware |
| `camera.py` | Pi camera, USB camera, and the simulated bed |
| `link.py` | MQTT: missions in, progress and reports out |
| `report.py` | JSON report, SVG field map, camera mosaic |
