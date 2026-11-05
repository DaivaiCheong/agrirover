# AgriRover — survey rover

The rover drives a bed cell by cell, photographs each cell from above and
reports, per cell: is there a plant, does it need water, is it yellowing. It
does not water anything. Cells that need water become proposals the farmer
approves, and execution then passes through the same rule engine and firmware
limits as every other irrigation ([control-hierarchy.md](control-hierarchy.md)).

## Mission flow

1. The farm server publishes a mission: `POST /api/v1/missions {zoneId, rows, cols, cellM}`
   → MQTT `devices/rover-01/mission/set`.
2. The rover validates it (≤ 40 × 40, ≤ 400 cells, cell 0.2–1.0 m) and plans a
   serpentine path: every cell once, every step to an adjacent cell.
3. For each cell: check guards → drive → photograph → analyse → record.
4. Progress goes out on `mission/state` (retained); the full report on
   `mission/result`. The report is also written to disk on the rover.
5. The farm server keeps the live state in memory for the Rover screen (`services/rover_live.py`) and stores the
   finished report in `survey_mission` and `survey_finding`. A survey of a bed it does not know (a sample-data bed) is
   not stored. Watering targets are shown for a person to act on; they do not become `action_proposal` rows yet.

The rover must stand on cell (0, 0), facing east (along row 0), before a mission.

Procedure for the person running it: [ROVER-SOP.md](../ROVER-SOP.md).

## The simulation on the Rover screen

`python -m rover run --sim-hardware` (the `rover-sim` service) is the real agent on the real broker: planner, vision,
guards, MQTT and reports are all production code. Only the wheels (`SimDrive`), the camera (`SimCamera`) and the field
(`SimField`, random plants, a drip line drying towards the far end) are generated. It runs ten times faster than the real
rover, and every report says `simulated: true`, so generated data can never pass for a field result.

The optional `sim` block on a mission (`seed`, `batteryV`, `rainAtCell`, `speedup`) is read only with `--sim-hardware`; the
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
| Geofence (simulation) | `rover/drive.py` | A move that would leave the bed is refused before it is made. |

## Vision

Classical colour indices — no training data, milliseconds on a Raspberry Pi,
and every number can be explained to a farmer:

| Output | Method |
|---|---|
| Plant / canopy % | Excess-Green index `ExG = 2g − r − b` on chromatic coordinates |
| Dryness 0–1 | Brightness of visible soil between calibrated wet and dry references (dry soil is lighter) |
| Yellowing | Share of leaf area that is saturated yellow; above 8 % the cell is flagged |
| Disease (optional) | MobileNetV2 tomato model on flagged cells only; advisory, threshold 90 % |

**Calibration on a real bed.** Under the rover's own light and shade hood,
photograph saturated soil and dry soil, and set `soil_v_wet` / `soil_v_dry` in
`rover/vision.py` (`Calibration`) to the mean brightness of each. Re-check when
the soil type changes.

In simulation (40 cells, `python -m rover sim`) the vision agrees with the
simulator's ground truth on 100 % of plants and 95–100 % of watering decisions
(errors only at the dry/wet threshold). Field accuracy has not been measured yet;
that is the first goal of the pilot.

## Reference hardware

| Part | Role |
|---|---|
| Raspberry Pi 4 | Rover computer: agent, camera, MQTT |
| Pi Camera Module (or USB webcam) | Top-down photo of each cell |
| Arduino Nano / Uno | Motor controller — firmware in `edge/rover-motor-controller` |
| TB6612FNG or L298N | Dual H-bridge for the two wheel motors |
| 2 × 12 V geared DC motors + caster | Differential drive |
| 3S Li-ion pack + BMS, 5 V buck for the Pi | Power; battery read on A0 through a 100k/33k divider |
| Front bumper microswitch | Hardware stop |
| LED ring + shade hood | Even light, so soil brightness means moisture, not sun |

Wiring is in the header of `rover_motor_controller.ino`.

## Known limits — and what comes next

- **No physical e-stop.** The parts list has no power-cut switch, and the on-screen e-stop travels over Wi-Fi and is forgotten if the
  rover restarts. Fit a switch before any physical run.
- **No login.** Anyone with the app's address can start or stop the rover. Add one before connecting real hardware.
- **Tree crops.** A downward camera under a hood suits low beds; it cannot see a guava canopy. Trees need another camera and GPS waypoints.
- **Dead reckoning.** Position comes from timed wheel runs. Next: wheel encoders and an IMU.
- **Bed scale.** The grid planner suits beds and row crops. For whole fields:
  GPS waypoints via ArduPilot Rover (the team has already set up ArduPilot GPS waypoint missions on its drone build).
- **Heuristic vision.** Needs per-field calibration; to be validated against
  soil-moisture probe readings during the pilot.
- **Rover hardware** is being built; the software has been tested in simulation
  and against an Arduino stub, not yet on the chassis.
