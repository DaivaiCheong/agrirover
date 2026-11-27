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

## At each plant: the camera and the photo check

At each stop the rover photographs the plant and measures leaf cover and yellowing on the Pi. A plant with more than
8 % yellow leaf is flagged, and the rover sends a larger photo of it (up to 640 px). The farm server then:

1. keeps the photo in **Health › Photo library**, with the plant's row and spot, for an expert to confirm;
2. asks the photo check what it shows, with the **tomato** disease guide on a tomato block (early and late blight,
   Septoria, bacterial spot, leaf mould, leaf curl and mosaic viruses, wilt, blossom-end rot, feed shortages,
   whitefly, leaf miner, fruit borer, cracking: **Health › Disease guide › Tomato**);
3. shows the answer on that plant in the Rover screen ("Possible early blight · or septoria leaf spot").

Triage, not a diagnosis: the tomato guide is not yet checked by an agronomist, and the model's accuracy was only
measured on guava. `PHOTO_MATCHES=true` lets it name the closest entries; without it, it says only healthy or problem.
A simulated round is not checked (its camera draws squares) unless `CHECK_SIMULATED_PHOTOS=true`.

**The photo model: local gemma4.** This farm runs `gemma4` (6.1 GB) in Ollama on the PC: free, and photos stay
here. It needs Ollama 0.40 or newer (`ollama pull gemma4`), with `OLLAMA_URL=http://host.docker.internal:11434` and
`OLLAMA_MODEL=gemma4` in `.env`, then `docker compose up -d api`. The first photo after a restart takes about two
minutes while the model loads; then a few seconds each. The online models at ollama.com need usage credits or a
subscription (without them every check answers "not included in your Ollama plan").

Checked on 27 Nov 2026 on one field photo of tomato leaves with brown, yellow-edged patches: "problem, several brown
and yellow spots"; with names on, "early blight, or Septoria leaf spot". One photo is not a measure. Names stay off
(`PHOTO_MATCHES=false`) until it is scored on labelled tomato photos from the photo library: on guava, local gemma4
told healthy from a problem 130 times in 148, but named the disease right only 18 times in 119.

Free pretrained tomato-disease models (YOLO or classifiers) are trained on PlantVillage lab photos of single leaves,
and fall to about 11-31 % on field photos, so none is used yet. With a few hundred expert-labelled photos of your own,
fine-tune one and score it against this check with `scripts/eval_photo_check.py`.

The soil probe is not on the rover yet: a real round records no soil readings (`rover/probe.py`).

## Plant Inspection video

**Title:** "AgriRover Plant Inspection: a rover that checks every tomato plant for disease and nutrient problems".

**The problem it solves.** Problems are found late because nobody can walk every plant every day. A farmer cannot
easily tell a disease from a feed shortage, so the wrong spray or fertiliser is bought. Experts are far away. The rover
looks at every plant, names the likely problem (triage), says what to do now and why, and keeps the photo for an
expert, all on the farm, with no internet.

**What the screens show.** Rover: the plant map; each plant gets a coloured bar as its photo is checked (red disease,
amber nutrient, purple pest, green healthy); the strip under the map counts them; tap a plant for its card (the rover's
photo, the finding, *Looks like*, *Do now*, *Why it happens*). Plant health › Inspection: the same map and the round's
report, problems listed with their photos; a plant opens the same card. Each card links to the same plant on the
other page. Photo library: every inspection photo, for an expert to confirm.

**What it can name** (tomato guide, `apps/api/app/services/tomato_diseases.py`): early and late blight, Septoria,
bacterial spot, leaf mould, leaf curl and mosaic viruses, wilt; nitrogen, phosphorus, potassium, magnesium, zinc,
iron and boron shortages and blossom-end rot (calcium); whitefly, leaf miner, fruit borer. The rule it reads first:
signs on **old leaves** point to N, P, K or Mg (they move to new growth); on **young leaves** to Ca, Zn, Fe or B (they
cannot move). A shortage card says which nutrient blocks it (Mulder's chart: high potassium blocks magnesium, high
phosphorus blocks zinc and iron, …).

### Set up the floor

- **Plant map:** on Rover, shrink T1 to **1 row × 5 or 6 spots, 0.5 m apart**, keep the plants on, **Save plant map**.
  Tape a straight lane and a mark at each spot.
- **Printed leaves:** A5, **matte** paper (gloss reflects), one close-up leaf per sheet, filling the frame. A good set:
  2 healthy, early blight, late blight or Septoria, leaf curl virus, and one or two shortages (magnesium: yellow between
  green veins; nitrogen: pale old leaves; potassium: scorched edges).
- **Where they stand:** the camera faces forward, so the rover turns to look. Tape each sheet upright on a box
  **35-40 cm to the left of its spot**, facing the lane, its centre at camera height. Even light, no sun patches.
- **Rover screen, before Start round:** *Camera check every plant* on; *Camera: Forward, turn left to look*.
- **Settings:** `.env` has `OLLAMA_MODEL=gemma4` and `PHOTO_MATCHES=true` (names on, as triage). The first check after a
  restart takes about two minutes while gemma4 loads: run one rehearsal round first.

### Rehearse without the rover (10 minutes)

Put the same pictures (as files) in a folder, then on the PC: `cd edge/rover-agent`, set `MQTT_HOST=localhost`,
`python -m rover run --sim-hardware --photos <folder> --speedup 10`. Start a round from the Rover screen: each plant
gets a finding within a few seconds. Check each answer is the one you want to show; swap any picture it gets wrong.
**Stop it (Ctrl+C) before the real rover connects**: both would answer as ROVER-01. Checked on 27 Nov with a field
photo of early blight: all three stops came back "Possible early blight, or Septoria leaf spot".

### Shot list

1. Rover screen: the plant map, *Camera check every plant*, the checklist ticked → **Start round**.
2. The rover drives the lane, stops, turns to each sheet, turns back (film from the side).
3. The screen: bars appear plant by plant; tap a plant mid-round: its photo and finding.
4. **See the report in Plant health**: the summary ("6 inspected · 2 disease · 1 nutrient · 3 healthy"), the list.
5. Open a nutrient plant: *Do now* and *Why it happens* (Mulder's chart) → **Show on the rover map** to come back.
6. Photo library: the expert confirms one photo.

Say on camera: it is a triage, not a diagnosis, and an expert confirms before treating; the rover does not read the
soil yet. The models were measured on guava photos, not yet on tomato.

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
