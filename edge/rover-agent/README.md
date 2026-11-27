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
cp .env.example .env                      # MQTT_HOST, ROVER_SERIAL_PORT, calibration, battery stop
python -m rover jog forward 0.5           # calibrate: measure, correct ROVER_MPS_AT_CRUISE in .env
python -m rover jog turn 90               # ... and ROVER_DPS_AT_CRUISE
python -m rover run                       # Pi camera; --usb-camera for a webcam, --no-camera for none
```

A round may name `stops` (the plants of a block's plant map): the rover then drives from the first to the last and
stops at those only. Floor demo, step by step: [docs/TOMATO-DEMO.md](../../docs/TOMATO-DEMO.md).

Two more mission options, for a plant inspection round:

- `inspect: true` sends a photo (JPEG, at most 640 px) of every plant to the farm server. Without it, only plants
  with yellowing leaves come with a photo.
- `look: "left"` or `"right"`: the camera faces forward, and the plants stand beside the lane. At each stop the rover
  turns 90 degrees toward the plant, in place, photographs it, and turns back before driving on. Left out: no turn.

Every progress message carries `inspect`, `look` and `photosReal`.

Without hardware, against a real broker: `python -m rover run --sim-hardware`
(or `docker compose --profile sim up` from the repository root).
To rehearse with real leaf pictures, add `--photos DIR`: the simulated rover photographs the `.jpg` / `.jpeg` /
`.png` files in DIR, in name order, one per stop (starting again after the last, and from the first on each round).
Its progress messages then say `"photosReal": true`, so the farm server checks the photos although the rover is
simulated.

| Module | Does |
|---|---|
| `planner.py` | Serpentine coverage path and the turns / moves between cells |
| `probe.py` | The soil probe and air sensor at each tree. The real RS485 reader is not written |
| `vision.py` | Leaf cover and yellowing per photo; optional TFLite disease model |
| `mission.py` | Runs a survey; checks the guards before every move; builds the report |
| `safety.py` | Guards (e-stop, rain, battery, link) and command clamps |
| `drive.py` | `SimDrive` and `SerialDrive` (motor controller over USB) |
| `protocol.py` | Serial frames, shared with the firmware |
| `camera.py` | Pi camera, USB camera, a folder of pictures, and the simulated bed |
| `link.py` | MQTT: missions in, progress and reports out |
| `report.py` | JSON report, SVG field map, camera mosaic |
