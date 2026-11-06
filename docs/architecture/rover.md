# AgriRover: the orchard rover

**The goal since 6 Nov 2026:** the rover checks guava leaf nutrients, block by block, following the LENS concept: collect, scan, act ([plan](../PLAN.md), [comparison](../PICKETA-RESEARCH.md)). **The nutrient round is not built.** No scanner is chosen, and the software has no leaf stop.

**What runs today, in simulation:** the rover goes to every guava tree once a day. At each tree it photographs the canopy from the side, lowers a soil probe,
and reads the air. It does not water or feed. The farm server turns the round into the day's advice
(`services/advisor.py`): water per tree, whether to feed, and trees to look at. A person acts on it.
Any watering then passes through the same firmware limits as every other irrigation ([control-hierarchy.md](control-hierarchy.md)).

## The nutrient round (planned, not built)

| Step | What happens | Status |
|---|---|---|
| When | Once per stage for each block, not daily: guava leaf standards sample at a set stage | Planned |
| Collect | A person walks with the rover and picks the third leaf pair, mid-canopy. An arm comes only after this works | Planned |
| Scan | The scanner on the rover reads each leaf. Which scanner: table test first ([options](../GUAVA-RESEARCH.md#leaf-nutrient-check-6-nov-2026)) | Not chosen |
| Result | N, P, K, Mg as low / OK / high for the block. A nutrient appears only after its paired lab tests pass | Not built |
| Why | Soil EC and pH from the same block help explain a low leaf | Rule exists, for yellow leaves only |
| Act | One thing to do | Advice does not take a leaf result yet |

How many leaves a scan needs, and how long a stop takes, are not known. The nearest published arm reached 70 % end to end on pistachio, with a 6-axis arm, in a preprint.

## Mission flow (today's soil round)

1. The farm server publishes a round: `POST /api/v1/missions {zoneId, rows, cols, cellM, rowM}` (trees in a row, tree to tree, row to row)
   → MQTT `devices/rover-01/mission/set`.
2. The rover validates it (at most 40 × 40 and 400 trees, spacing 0.2–10 m) and plans a
   serpentine path: every tree once. Long moves are split into steps of at most 1 m.
3. For each tree: check guards → drive → photograph → analyse → read the probe and air sensor → record.
4. Progress goes out on `mission/state` (retained); the full report on
   `mission/result`. The report is also written to disk on the rover.
5. The farm server keeps the live state in memory for the Rover screen (`services/rover_live.py`) and stores the
   finished report in `survey_mission` and `survey_finding`, and each reading's bed average in `sensor_reading`, so the rover feeds
   the telemetry table. The day's advice is worked out from the newest fresh round; it does not become `action_proposal` rows yet.

The rover must stand at the first tree, facing along row 1, before a round.

Procedure for the person running it: [ROVER-SOP.md](../ROVER-SOP.md).

## The simulation on the Rover screen

`python -m rover run --sim-hardware` (the `rover-sim` service) is the real agent on the real broker: planner, vision,
guards, MQTT and reports are all production code. Only the wheels (`SimDrive`), the camera (`SimCamera`), the probe (`SimProbe`) and
the orchard (`SimField`, a drip line drying towards the far end) are generated. It runs forty times faster than the real
rover, and every report says `simulated: true`, so generated data can never pass for a field result.

The optional `sim` block on a mission (`seed`, `batteryV`, `rainAtCell`, `speedup`, `base`, `moistureSpread`) is read only with `--sim-hardware`; the
real rover ignores it. Scripted rain raises the same `SafetyStop` a real rain reading would.

## MQTT topics

| Topic | Direction | Payload |
|---|---|---|
| `devices/rover-01/mission/set` | server → rover | `{missionId, zoneId, rows, cols, cellM}` |
| `devices/rover-01/mission/state` | rover → server, retained | progress (with each cell's reading and a small photo), then the final summary |
| `devices/rover-01/mission/result` | rover → server | full report: cells, watering targets |
| `devices/rover-01/estop` | server → rover | `{"estop": true}` engages, `{"estop": false}` releases |
| `devices/rover-01/status` | rover → server, retained | `online` / `offline` (last will), and whether its e-stop is on |
| `farm/<farm>/zone/+/telemetry` | field node → all | rain in any zone stops a survey |

## Safety layers

| Layer | Where | Guarantee |
|---|---|---|
| Motor-controller firmware | `edge/rover-motor-controller` | Every run ≤ 1.5 s and ≤ PWM 200, whatever the Pi sends. Stops on lost serial link (2 s) and on the bumper. Motors off at power-up. |
| Command clamps | `rover/safety.py`, `rover/drive.py` | Speed ≤ 0.3 m/s, single step ≤ 1 m, runs split into firmware-sized segments, every segment acknowledged. |
| Mission guards | `rover/mission.py` | Checked before every move and photo: e-stop, rain, battery < 11.1 V, lost broker link. The rover always ends stopped, with a partial report. |
| Geofence (simulation) | `rover/drive.py` | A move that would leave the block is refused before it is made. |

## What it reads at each tree

All of these are simulated in the demo today. It reads no leaf nutrient.

| Reading | Comes from | Used for |
|---|---|---|
| Moisture, EC, pH, soil temperature | 7-in-1 RS485 probe, pushed 15-30 cm at the drip line | Water per tree; EC holds the feed; pH changes the feed |
| N, P, K | The same probe | **Shown as a trend only, and out of the promise since 6 Nov.** Low-cost probes infer these from conductivity and cannot set a dose ([research](../GUAVA-RESEARCH.md)) |
| Air temperature, humidity | Sensor on the mast | Rules (fungal, fruit fly, spray window); nudges the day's water |
| Leaf cover, yellow leaves | Side camera, colour indices | Growth over time; trees to look at |
| Rain | The fixed field node | Stops the rover; no water today |

## Vision

Classical colour indices: no training data, milliseconds on a Raspberry Pi, and every number can be explained to a farmer.

| Output | Method |
|---|---|
| Leaf cover % | Excess-Green index `ExG = 2g − r − b` on chromatic coordinates |
| Yellowing | Share of leaf area that is saturated yellow; above 8 % the tree is flagged |
| Disease (optional) | A leaf model on flagged trees only; advisory, threshold 90 %. The existing adapter was trained on tomato: a guava model is still needed |

These indices were written for a top-down photo under a hood. A side view of a real canopy, in open light, against sky and
other trees, will need new work and is not tested. Fruit count and size from photos are not built; fruit size is typed in.

## Parts for guava

| Part | Role | Why | Status |
|---|---|---|---|
| Raspberry Pi 4 | Rover computer | Agent, camera, MQTT | Have design |
| Arduino Nano / Uno, TB6612FNG or L298N | Motor controller | Firmware in `edge/rover-motor-controller` | Written; wiring in the `.ino` header |
| **Power-cut switch** | Stop with no software | The on-screen e-stop travels over Wi-Fi | **Required before any run** |
| Front bumper switch | Hardware stop | Firmware already stops on it | Designed |
| **Larger wheels and frame** | Orchard ground | Ruts, mud in the rains, low branches. Size to fit between your rows | To design |
| **GNSS (RTK if the budget allows)** | Where it is in the block | Open sky at row ends | To add |
| **2D or 3D LiDAR, wheel encoders, IMU** | Steer between trunks | GNSS degrades under canopy; timed wheel runs drift | To add. ArduPilot Rover or ROS 2 |
| **Mast, side camera** | Canopy at 1-2 m | A downward camera under a hood cannot see a tree | To add |
| **Air temperature and humidity sensor** | On the mast, shaded | Canopy-height air | To add |
| **Leaf scanner** | Reads leaves for the nutrient check | The product since 6 Nov. A person feeds it leaves first | Not chosen: table test first |
| **Leaf arm** | Picks or clips a leaf at 1-2 m | Only after a person-fed scanner works | Later |
| **Probe arm, 7-in-1 RS485 probe** | Soil at each stop | Must push through dry-season soil and clean itself. Moved behind the leaf work | To design: the hardest part |
| 3S Li-ion pack + BMS | Power | Size after a timed row test | Unknown: arm and LiDAR add load |

## Known limits — and what comes next

- **No physical e-stop.** The parts list has no power-cut switch, and the on-screen e-stop travels over Wi-Fi and is forgotten if the
  rover restarts. Fit a switch before any physical run.
- **No login.** Anyone with the app's address can start or stop the rover. Add one before connecting real hardware.
- **Navigation is not written.** Position comes from timed wheel runs, which is not enough between trees. The team has already set up
  ArduPilot GPS waypoint missions on its drone build, which is a good start.
- **No leaf scanner, leaf stop or leaf result.** The rover cannot check a nutrient yet.
- **The probe reader and arm are not built,** and the stop time per tree (40 s) is an estimate. A real `rover run` passes no probe (`rover/__main__.py`), so it would report no readings.
- **The simulated battery drain is invented.** Endurance is unknown until a timed row test.
- **Rover hardware** does not exist yet in this form. The software has been tested in simulation and against an Arduino stub.
