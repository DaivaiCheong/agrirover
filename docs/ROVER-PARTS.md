# AgriRover: rover parts list

Everything needed to build the guava rover, in the order to buy it: what to get, how many, and what in the code it must match.

> **Status: draft, 2026-11-27.** No part has been bought or tried on a chassis. The first table lists what the software and firmware already fix; everything else is a starting choice, to change after tests. Prices are left out because they need local quotes.

**Before you buy anything**

1. **Build in stages, and test each stage before buying the next.** The plan's order: the soil probe on a table, then carried by hand from tree to tree, then a chassis that drives one row, then a whole block, then the sensors on the rover ([PLAN.md](PLAN.md#step-4-accelerate-weekly-cycles)).
2. **Measure the orchard:** the narrowest gap between trunks and canopy, the lowest branch, the ground (ruts, slope, mud in the rains), and the Wi-Fi signal at the far end of each block.
3. **Make the [five decisions](#five-decisions-before-you-buy)** at the end of this page. Two of them change what you buy.

## What the code already fixes

Buy parts that match these, or plan the code change with them.

| Thing | Must be | Set in |
|---|---|---|
| Rover computer | Raspberry Pi 4 on Raspberry Pi OS (it ships `picamera2`) | `edge/rover-agent` |
| Motor controller | ESP32 DevKit, or Arduino Nano / Uno (ESP8266 also builds). USB serial at 115200 baud, expected at `/dev/ttyUSB0`. An ESP32 or Nano usually appears there; an Uno appears at `/dev/ttyACM0`, and on a Windows PC it is a `COMn` port, so set `ROVER_SERIAL_PORT` | `rover/config.py`, firmware |
| Motor driver | Two channels, left and right. Left: PWM on D5, direction on D7 and D8. Right: PWM on D6, direction on D9 and D10 (the L298N or TB6612FNG wiring). **ESP32 (rover-mc-2.1.0):** two L298Ns, one per side, one ESP32 pin for each L298N pin, ENA/ENB jumpers off. Left board: ENA D32, IN1 D33, IN2 D25, IN3 D26, IN4 D27, ENB D13. Right board: ENA D23, IN1 D22, IN2 D21, IN3 D19, IN4 D18, ENB TX2 (GPIO 17). Drawing: [hardware/rover-wiring.svg](hardware/rover-wiring.svg) | `edge/rover-motor-controller/rover_motor_controller.ino` (`channels[]`), `docs/hardware/rover_wiring.py` |
| Drive | Differential: it turns on the spot by running the two sides opposite ways. Timed runs, no encoders yet: PWM 150 is taken as 0.20 m/s until it is calibrated on your ground | `rover/drive.py` |
| Limits | At most 0.3 m/s, PWM 200 of 255, and 1.5 s per run | `rover/config.py`, firmware |
| Battery | 3S lithium-ion: 12.6 V full, and the rover stops at 11.1 V. The voltage is read through a 100 kΩ / 33 kΩ divider into A0. **ESP32:** a 100 kΩ / 22 kΩ divider into GPIO 34, then set `VBAT_WIRED 1` in the firmware | firmware, `rover/config.py` |
| Bumper | A switch from D2 (ESP32: GPIO 4) to ground: normally open, pressed = LOW | firmware |
| Camera | A Pi camera (640 × 480) or a USB camera (`python -m rover run --usb-camera`) | `rover/camera.py` |
| Soil probe | A 7-in-1 RS485 probe. Its reader is not written yet: it needs the probe's datasheet | `rover/probe.py` |
| Network | Wi-Fi to the farm server's MQTT broker for the whole round. A lost link stops the rover | `rover/safety.py` |

## Stage 1: bench kit

Goal: the real rover software turns two wheels on a table through the real firmware, and the soil probe is read on a table, then carried by hand from tree to tree.

| Part | What to buy | Qty | Notes |
|---|---|---|---|
| Raspberry Pi 4 | 4 GB | 1 | The rover computer |
| microSD card | 32 GB or more, high-endurance | 2 | One spare, already flashed |
| Arduino | Nano (ATmega328P) or Uno, with its USB cable | 2 | One spare. Flash `rover_motor_controller.ino` |
| Bench motor driver | TB6612FNG or L298N module | 1 | The firmware's own wiring. For small bench motors only (see stage 2) |
| Bench motors | Small 12 V DC gear motors | 2 | |
| Bumper switch | Microswitch, normally open | 1 | D2 to ground |
| Battery divider | 100 kΩ and 33 kΩ resistors | 1 each | Into A0 |
| Battery | 3S lithium-ion pack with a BMS | 1 | Can be the rover's final pack. **Not LiFePO4:** a full 3S LiFePO4 pack sits below the 11.1 V stop |
| Charger | Balance charger for 3S lithium-ion | 1 | |
| Fuse | Inline blade fuse holder and fuses | 1 | On the battery's positive lead |
| 5 V supply for the Pi | Buck converter, 12 V in, 5.1 V out, 3 A or more | 1 | A Pi on a weak supply crashes and can corrupt its card |
| Soil probe | 7-in-1 RS485 (Modbus RTU) probe: moisture, temperature, EC, pH, plus N, P, K | 1 | **Buy only one that comes with its datasheet and Modbus register map:** the reader cannot be written without them. N, P and K are never used to set a dose |
| RS485 adapter | USB to RS485, isolated if possible | 1 | Connects the probe to the Pi |
| Camera | Raspberry Pi Camera Module 3, or a USB camera | 1 | For bench tests. Stage 4 puts a camera on the mast |

## Stage 2: chassis, drive one row between trunks

| Part | What to buy | Qty | Notes |
|---|---|---|---|
| Frame | Aluminium extrusion or a welded frame | 1 | Narrower than your narrowest row, with 15 cm or more under it for ruts and hoses |
| Drive motors | 12 V DC gear motors, high torque, **with Hall encoders** | 4 (or 2) | 4 for four-wheel skid steer, or 2 with a caster ([decision 1](#five-decisions-before-you-buy)). About 30-50 rpm suits 25-30 cm wheels at 0.2-0.3 m/s. Buying encoders now saves buying motors again for navigation |
| Wheels | 25-35 cm, treaded rubber or pneumatic | 4 (or 2 and a caster) | For mud in the rains |
| Motor driver | Dual channel, rated above the stall current of the motors on each side, with PWM and direction inputs | 1 | TB6612FNG (1.2 A a channel) and L298N (2 A) are too small for orchard wheels. With PWM + direction inputs the firmware's pins still fit: D5 and D6 to PWM, D7 and D9 to direction. Check the driver's datasheet, and swap a motor's leads if that side runs backwards |
| **Power-cut switch** | Latching mushroom emergency switch, rated for the motor current | 1 | **Required before any run.** It cuts the motor power (and later the arm's) with no software: the on-screen e-stop travels over Wi-Fi. Get two contacts if you can, so the second can tell the software later |
| Front bumper | A bar with microswitches wired in parallel | 1 set | The firmware already stops on it |
| Battery | 3S lithium-ion, about 10-15 Ah ([first guess](#battery-a-first-guess)), BMS rated 20 A or more | 1, plus a spare | |
| Wiring | 14-16 AWG for motor power, XT60 connectors, a main switch, a fuse for each driver | | |
| Enclosure | IP65 box, light coloured, vented through a filter, with cable glands | 1 | A Pi in a closed box in the sun slows down or shuts off |
| Wi-Fi adapter | USB, with an external antenna, supported by Raspberry Pi OS | 1 | Optional. The Pi's own Wi-Fi is weak at the far end of a row |

### Battery: a first guess

Ours, not measured. A 100-tree round takes about 2 hours ([ROVER-SOP.md](ROVER-SOP.md#numbers-behind-this-procedure)). The rover drives for about a quarter of that time and stands at trees for the rest.

- **Power:** electronics about 6 W, motors about 50 W while moving, plus a probe arm and LiDAR later. That averages about 25-45 W, or 50-90 Wh a round.
- **Usable share:** the 11.1 V stop is about 3.7 V a cell, which leaves roughly half the pack unused. So the pack needs about twice the energy: 100-180 Wh, which is 10-15 Ah at 3S.

Size the real pack after the timed row test. Or measure the pack's discharge curve and then lower the stop.

## Stage 3: navigation, drive a whole block

Settle [decision 2](#five-decisions-before-you-buy) first: it changes this list.

| Part | What to buy | Qty | Notes |
|---|---|---|---|
| GNSS receiver and antenna | RTK-capable (u-blox ZED-F9P class) if the budget allows, otherwise a standard receiver | 1 | Good at the row ends, poor under canopy, so it cannot steer between trunks alone |
| RTK corrections | Khmer GEONET network RTK (needs internet on the rover), or your own base station (a second receiver and antenna) | | Only with RTK. A base station keeps the farm working offline |
| LiDAR | 2D LiDAR mounted at trunk height (RPLIDAR or LDRobot class). 3D only if 2D is not enough | 1 | Finds the trunks to steer between. Later it is also the obstacle sensor that a round with nobody there needs |
| IMU | 9-axis with sensor fusion (BNO085 class) | 1 | Not needed if a flight controller provides one |
| Wheel encoders | Already on the stage-2 motors | | The motor firmware has no encoder input yet |
| Flight controller (ArduPilot route) | A Pixhawk-class board running ArduPilot Rover | 1 | Takes over from the Arduino. The team already runs ArduPilot on its drone |

None of this is written yet: today the rover estimates its position from timed wheel runs.

## Stage 4: sensing at the tree

| Part | What to buy | Qty | Notes |
|---|---|---|---|
| Mast | A 1-2 m pole with a steady camera mount | 1 | Sees the canopy from the side. Check the lowest branches: it may need to fold |
| Side camera | USB camera on the mast | 1 | USB avoids a long Pi camera ribbon up the mast. The colour indices were written for a top-down photo and are not tested on a side view |
| Air temperature and humidity | RS485 (Modbus) sensor in a radiation shield, shaded, on the mast | 1 | Shares the probe's RS485 adapter and reader: give it a different Modbus address. An I²C sensor (SHT31 class) is cheaper but meant for short wires. Its reader is not written either |
| Probe arm actuator | 12 V linear actuator, about 300-400 mm stroke, with end-stop switches | 1 | Pushes the probe 15-30 cm into the soil at the drip line. Find the force needed by pushing the probe into dry-season soil by hand. The hardest part, and moved behind the leaf work |
| Arm driver | A relay pair or a small H-bridge | 1 | The firmware has no arm control yet |
| Arm guard and cleaner | A cover over the moving parts, and a brush or wiper for the probe | 1 | Old soil on the probe gives false readings |

## Stage 5: leaf scanner, after the table test

The scanner is the product since 6 Nov, but **do not buy one for the rover yet**. First test candidates on a table against lab results ([options](GUAVA-RESEARCH.md#leaf-nutrient-check-6-nov-2026)).

| Option | Cost found | For and against |
|---|---|---|
| AS7265x breakout | About US$70 (January 2025), plus a light and a housing | Cheap, 18 bands. No guava or field result seen |
| AS7262 + AS7263 | About US$200 as a prototype | A published build. Nitrogen only, greenhouse only |
| Nirone S2.2 | Price not found | The best evidence on fresh leaves. Weak on K and Mg |
| LENS | US$10,000 a year | A working product. Guava not listed |

A leaf arm comes only after a scanner fed by a person works.

## Outside the rover, also needed

| Part | Why |
|---|---|
| Farm server: a Raspberry Pi 4 or 5 (8 GB suggested) or a mini PC, with a USB SSD | Runs the broker, database, API and dashboard (`docker compose up -d`). A database wears out an SD card |
| A PC with a GPU, or internet | The photo check's local model (`gemma4`) took about 3 s a photo on an RTX 2080 Super. Not tried on a Pi, and expected to be far too slow there. Otherwise use the hosted model, and photos leave the farm |
| Wi-Fi across every block | Outdoor access points. Walk each row with a phone first: a lost link stops the rover |
| Field node with a rain sensor | Rain stops the rover. Already built: its parts and wiring are in the header of `edge/esp8266-field-node/esp8266_field_node.ino` |
| Tools | Multimeter, soldering iron, crimper for XT60 and terminals, drill, hex keys, heat-shrink |

## Five decisions before you buy

1. **Drive layout.** Four-wheel skid steer (4 motors, each side's pair on one driver channel) is better in mud and ruts, and the code's turn on the spot works with it. Two wheels and a caster are cheapest, for a first row on firm ground, but casters dig into mud. *Our suggestion: four wheels.*
2. **Navigation.** ArduPilot Rover on a flight controller: the team knows it, and it brings GNSS, IMU and encoder support. It replaces the Arduino, so the rover software needs a new drive back-end, and the firmware's protections (1.5 s runs, PWM 200, a stop on a lost link or the bumper) must be set up again in ArduPilot. Or ROS 2 on the rover computer: more flexible but more work, and LiDAR mapping may need more than a Pi 4.
3. **Battery size and type.** Keep 3S lithium-ion, or change the divider and the 11.1 V stop with it. Size the pack after the timed row test.
4. **Camera.** A USB camera up the mast (our suggestion), or the Pi itself on the mast with a Pi camera.
5. **RTK or not.** RTK, with corrections, gives centimetres in the open. Without it, the LiDAR must do more of the work between the rows.

## Code each new part needs

| Part | Code to write | Where |
|---|---|---|
| 7-in-1 probe | The RS485 reader, then pass it to the round: `python -m rover run` passes no probe today, so a real round would report no readings | `rover/probe.py`, `rover/__main__.py` |
| Air sensor | Its reader, beside the probe's | `rover/probe.py` |
| Bigger motor driver | None, if wired as in stage 2 | |
| Encoders, IMU, GNSS, LiDAR | Navigation ([decision 2](#five-decisions-before-you-buy)). Today's drive is dead reckoning | `rover/drive.py` |
| Probe arm | Arm control and its interlock | `edge/rover-motor-controller` |
| Power-cut switch, bumper | None: the bumper is already in the firmware | |
| App login | Required before any real hardware connects: today anyone with the app's address can start the rover | `apps/api`, `apps/web` |

The specs fixed by the code come from the files named above and from [rover.md](architecture/rover.md). Safety steps before the first run: [ROVER-SOP.md](ROVER-SOP.md#before-any-physical-run).
