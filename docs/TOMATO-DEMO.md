# Tomato demo: the rover goes from plant to plant

One tomato farm. On the **Rover** screen you place the plants on the block's map, and the rover drives from the first
plant to the last, stopping at each one for a photo and a soil reading. The **Farm** screen rates every reading
against tomato's targets.

**What it shows:** the farm server sends the round, the rover follows the map, stops at the plants, drives past the
empty spots, and reports each stop live on the map. **What it does not:** see where it is. The rover drives by time
and its calibration (dead reckoning), so it ends up where the map says only if it starts on the right spot, facing
the right way, and is calibrated on the same ground.

## The farm

The farm server adds **T1 Tomato farm** on its first start, and nothing else: the six guava demo beds and their
simulated rounds come only with `DEMO_ORCHARD=true` in `.env`.

T1 is 50 m²: **5 rows of 20 plants**, rows 1.0 m apart and plants 0.5 m apart, ordinary field spacing for tomato.
Three plants are missing (R2 T7, R4 T14, R5 T3), as on a real bed, so a round shows the rover drives past a gap.
Row 1 is at the bottom of the map; T1 is the first plant of a row. A full round is 97 stops, about 70 minutes on a
real rover (the probe time is an estimate), or under two minutes with the simulated rover.

- **Change the plants:** pick the block, **Place plants**, tap spots on the map, **Save plant map**.
- **Change the size or spacing:** open the `5 rows × 20 spots` line under the plant count, change it, **Save plant map**.
- **Another block:** **+ New block** beside the block chips. Every spot starts with a plant; remove the empty ones.
- **A bed made under Farm › Add bed:** pick it on the Rover screen, **Place plants for the rover**.
- **Change the start corner or direction:** **Route**, or tap a corner dot on the map.

### For the real rover on a floor today

Shrink the grid to fit the room before the run: for example **2 rows × 3 spots, 0.8 m × 0.5 m**, then **Save plant
map**. Mark each spot with tape. The rover drives through the spots, so **put each pot just beside its spot, on the
camera's side**, not on it. Keep the rows at least 0.6 m apart so a pot beside one lane is clear of the next. Set it
back to 5 × 20, 1.0 m × 0.5 m afterwards.

```
 row 2   [tomato]  [tomato]  [tomato]      ← 0.8 m between rows
 row 1   [tomato]  [tomato]  [tomato]
          T1  0.5 m  T2  0.5 m  T3
          ↑ start: the rover stands here, facing T2
```

## What each reading should be (tomato)

The Farm screen rates each reading against these, and shows the table when you open the block.

| Reading | Target | Critical | Why |
|---|---|---|---|
| Soil moisture | 60-75 % on the probe, even day to day | Below 45 %, above 85 % | Dry-wet swings cause blossom-end rot and split fruit |
| Soil pH | 6.0-6.8 | Below 5.5, above 7.5 | Below 5.5 calcium, magnesium and phosphorus run short; above 7.5 iron, manganese and zinc lock up |
| Soil EC (mS/cm) | 1.0-2.5 | Above 4.0 | Yield falls about 10 % for each 1 dS/m above 2.5 (Maas & Hoffman 1977); salt also slows calcium uptake |
| Soil temperature | 20-26 °C | Below 12 °C, above 32 °C | Cold roots take up little phosphorus |
| N, P, K | Trend only | None | The low-cost probe infers them from conductivity: they follow EC and water, not the nutrients |
| Air temperature | 18-30 °C | Below 10 °C, above 35 °C | Above about 32 °C flowers drop and pollen fails |
| Air humidity | 60-80 % | Above 90 % | Above 85 % leaf mould, grey mould and late blight spread |

**Nutrients together (Mulder's chart).** Too much of one nutrient blocks another: high potassium blocks magnesium
and calcium; high ammonium nitrogen blocks calcium and potassium; high phosphorus blocks zinc and iron; high calcium
blocks magnesium and potassium. On tomato the one to watch is calcium (blossom-end rot). The rover cannot check this:
its probe does not measure calcium, magnesium or any micronutrient, and its N, P and K are estimates. So the chart is
shown as a guide, never turned into a rating or a dose; balance comes from a lab test of leaves or soil.

These are starting targets for a field or bed in the tropics, for the whole season: tomato has no growth-stage table
here yet, and the moisture band uses the probe's own % scale until the probe is checked against a dry and a wet
sample of this soil. Code: `apps/api/app/services/tomato.py`.

## 1. The farm server (on the PC)

```powershell
docker compose up -d
```

Not `--profile sim`: the simulated rover also answers as ROVER-01, and would run the same round. Then:

- The app is at http://localhost:5173/rover. Pick **T1 Tomato farm**.
- Find the PC's address on the Wi-Fi with `ipconfig` (IPv4, for example 192.168.1.10). The Pi needs it.
- If the Pi cannot connect, allow port 1883 in Windows Firewall for private networks.

To rehearse without the rover, use `docker compose --profile sim up -d` instead: the simulated rover drives the
same map, forty times faster. Stop it before the real rover runs: `docker compose --profile sim rm -sf rover-sim`.

## 2. The motor controller (Arduino IDE, on the PC)

Upload `edge/rover-motor-controller/rover_motor_controller.ino`. It builds for an **ESP8266 NodeMCU / Wemos D1 mini**
and for an **Arduino Nano / Uno**, with an **L298N** (default) or an **L9110S** driver: set the driver at the top of
the sketch. The pins for each board and driver are in the sketch header. Join the grounds (battery −, driver GND,
controller GND), and keep the battery's + lead through the power-cut switch.

Serial Monitor at 115200 shows a `$BAT,…` line every second. Close the Serial Monitor before the Pi uses the port.

## 3. The rover's Pi

Copy the repository to the Pi (or `git clone` it and check out this branch), then:

```bash
cd edge/rover-agent
pip install -r requirements.txt pyserial
sudo usermod -aG dialout $USER        # once, then log out and in
ls /dev/ttyUSB* /dev/ttyACM*          # the motor controller's port
cp .env.example .env                  # then set MQTT_HOST, ROVER_SERIAL_PORT and the battery stop
```

**The battery stop.** `ROVER_BATTERY_MIN_V` is 11.1 V for a 3S pack. Use 6.6 for a 2S pack. If no battery divider
is wired to the controller yet, set it to **0**: otherwise a floating reading stops every round at once.

## 4. Calibrate on the floor (5 minutes)

Wheels on the floor, a clear metre in front, a hand on the power switch.

```bash
python -m rover jog forward 0.5       # measure how far it went
python -m rover jog turn 90           # measure how far it turned (+ is left)
```

Each prints the line to correct, for example `ROVER_MPS_AT_CRUISE = 0.200 x (metres measured) / 0.5`. Put the new
numbers in `.env` and jog again until a 0.5 m run is within 2-3 cm and a 90° turn looks square. If a wheel turns
the wrong way, set `LEFT_DIR` or `RIGHT_DIR` to -1 in the sketch and upload again. If the rover barely moves, raise
`ROVER_PWM_CRUISE` (up to 200) and measure again.

## 5. Run the round

```bash
python -m rover run                   # Pi camera; --usb-camera for a webcam; --no-camera to drive without one
```

The Rover screen shows **ROVER-01 online** and **Real rover**. Then:

1. Stand the rover on the start spot the screen names, facing the spot it names ("Rover on R1 T1, facing R1 T2").
2. Tick the three checks, **Start round**. One person stays by the power switch.
3. It stops at each tomato for a photo, drives past the empty spots, and the map follows it. The report is stored at
   the end. **E-stop** on the screen, the power switch and the bumper all stop it.

**If it ends early:** the yellow notice on the screen says why (battery, lost link, controller silent, bumper). Fix
it, put the rover back on the start spot, and run the round again: a round does not resume.

## Where the code is

| Part | Code |
|---|---|
| The plant map: table, API, the farm's block | `apps/api/app/models/entities.py` (`PlantMap`), `routers/plant_maps.py`, `alembic/versions/0011_plant_map.py`, `services/seed.py` (`seed_tomato_demo`) |
| Tomato targets and rules | `apps/api/app/services/tomato.py`, used by `services/conditions.py` |
| Rounds that stop at the plants only | `routers/missions.py` (`stops`), `edge/rover-agent/rover/planner.py` (`through_stops`), `mission.py` |
| The map, placing plants, new blocks | `apps/web/src/components/RoverMap.tsx`, `pages/Rover.tsx`, `lib/rover.ts` (`throughStops`) |
| Calibration, the battery stop, `jog` | `edge/rover-agent/rover/config.py`, `__main__.py`, `.env.example` |
