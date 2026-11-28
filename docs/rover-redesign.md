# AgriRover – Rover page redesign + physics twin (build prompt)

Nov 27, 2026 · @Vai

## How to use this prompt

Give everything below this section to your coding agent at the root of the AgriRover repo, together with the two screenshots (current Rover page and the rover photo).

1. Easiest: export this doc as Markdown, save it as `docs/rover-redesign.md`, and tell the agent: "Implement docs/rover-redesign.md phase by phase. Stop after Phase 0 and show me your plan." Put `rover_sanity.py` (the reference calculations) next to it.
2. Every value in the hardware profile comes from a datasheet or is marked *estimate*. Replace estimates with your own measurements (see "What to measure on the real rover") and the simulation becomes your rover, not a generic one.
3. The "Reference numbers" table is the test: if the agent's simulation does not reproduce those values within tolerance, the physics is wrong, not the table.
4. Formulas are written in TeX. Code blocks are meant to be copied into the codebase as they are. The two drawings are for people; the tables next to them carry the same facts for the agent.

## Role, goal and ground rules

You are a senior front-end engineer and robotics-simulation engineer. Redesign the Rover page of AgriRover (`localhost:5173/rover?zone=t1`) into a robotic agronomist: the rover scouts every plant, and the page tells the farmer what to do, where, how much and by when. Behind it, replace the mock 3D scene with a physics-based digital twin of ROVER-01.

Four goals:

1. **Advice first.** Every round ends in a short list of actions, each with an amount, a deadline, its evidence and a follow-up (see "The product: a robotic agronomist").
2. **Less text.** Persistent labels have at most 3 words. Explanations move into Why panels and tooltips. Each metric appears once.
3. **Real behaviour.** The 3D rover drives, turns, probes, drains its battery, slips and fails the way the real hardware would. Everything is computed from the equations in this prompt.
4. **Swappable twin.** The same UI runs on simulated telemetry today and on real ESP32 telemetry later, through one interface.

Ground rules:

- Keep the current stack, routing and sidebar. Read the repo before writing code. If the 3D scene uses three.js or React Three Fiber, keep it; otherwise add `three`, `@react-three/fiber` and `@react-three/drei`.
- Do not change the other pages (Today, Plan, Health, Crops, Finance, Farm), except for shared design tokens. Expose the advice engine so Today and Health can show the same cards later.
- The simulation core and the advice engine are plain TypeScript with no React or three.js imports. Test them with Vitest.
- Use SI units inside the simulation (m, s, kg, N, V, A, W, J). Convert to farmer units (litres, minutes, rows) only when displaying.
- Make it deterministic: a seeded random generator, so the same seed and parameters give an identical run and identical advice.
- Never script an outcome. A low-battery stop, a stuck wheel, a failed probe or an advice card must come from the physics and the rules, never from a timer or a hard-coded banner.
- Never invent a pesticide, fungicide or fertiliser product or dose (see the advice rules).
- Keep every default parameter in one file (`profile.ts`). Mark each one as sourced or as *estimate – measure*.
- Start with Phase 0: inspect the code, list the files you will change, propose the component tree, then stop and wait for approval.

## The product: a robotic agronomist

The farmer's problem is not a lack of data; it is not knowing, each day, which plants need what. The rover is the scout and the page is the agronomist: every round ends in a few actions, each with an amount, a deadline, its evidence and a follow-up.

### What it solves for the farmer

- **Finds problems early:** every plant, every round, instead of the few a person walks past. Many tomato problems start on the lower leaves, where the low camera looks.
- **Says why:** a likely cause with its evidence, and what else it could be.
- **Says how much:** litres per plant for only the plants that need it. In the T1 example below, 6 dry plants get 32 L; the same dose on all 97 plants would be 517 L.
- **Checks the result:** treated plants are re-checked on the next round.
- **Keeps records:** each plant's history and one report per round, which the farmer can show a buyer or a GAP inspector.

### The advice loop

1. **Scout:** the rover checks every plant (photos, plus a soil reading where it probes).
2. **Diagnose:** likely cause, what else it could be, how to tell them apart, confidence.
3. **Prescribe:** what to do, where, how much, by when.
4. **Act:** the farmer taps Done, Later or Wrong.
5. **Follow up:** the next round re-checks those plants and records the outcome.

The advice engine (`advice.ts`, plain TypeScript like the simulation) runs whenever a round ends, complete or partial, and feeds the Advice view.

### Advice card

| Part | Rule | Example |
| --- | --- | --- |
| Action | verb first, at most 6 words | Water 6 plants in row 3 |
| Where | plants grouped by row and run; highlighted on the field map | R3-P05 to R3-P10 |
| How much | farmer units: litres per plant and in total; drip time when the emitter flow is set | 5.3 L each, 32 L total, about 2 h 40 min at 2 L/h |
| By when | Now, Today, Tomorrow or Can wait | Today |
| Why | one line; tap for the evidence: photo crop with the symptom circled, readings, trend, the rule that fired | Dry two rounds in a row (0.19, refill point 0.21) |
| Confidence | High = measured; Medium = lane proxy or a single photo; Low = interpolated or partly seen | High |
| Buttons | Done, Later, Wrong; Wrong asks one question ("What was it?") and is logged | – |

### Advice rules

The engine is deterministic: the same round data always gives the same cards. Every number comes from the Agronomy section.

| Card | Trigger | Content |
| --- | --- | --- |
| Water now | θ\_root ≤ θ\_WP + 0.25 (θ\_trigger − θ\_WP) = 0.14 | refill volume (8.7 L at θ = 0.14); urgency Now |
| Water | θ\_root < θ\_trigger = 0.21, at least medium confidence | refill volume (5.3 L at θ = 0.19); neighbours in a row grouped into one card |
| Rain adjust | rain forecast with at least 60 % probability (optional weather feed) | subtract 0.8 × rain (mm) × A\_w (m²) litres: after 12 mm of rain, 3.9 L per plant remain; hold if 0.5 L or less (44 mm or more) |
| Too wet | θ\_root > θ\_FC + 0.03 = 0.30 for two rounds | "Pause watering row X" |
| Look at | symptom probability ≥ 0.5 | likely cause, could also be, how to tell, first safe step (hints below) |
| Spreading | same symptom on 3 or more neighbouring plants, or on more plants than last round | "Spreading in row X"; ask an agronomist or extension officer and attach the round report |
| Re-check | an action marked Done | next round compares; card says Recovered, Still dry or Spreading |
| Check by hand | low confidence, plant not reached, or symptom zone outside the camera's view | grouped into the field walk |
| No soil data | probes failed or were skipped for a whole row or more | one card: "No soil readings in row X: soil too hard for the probe"; suggest checking 3 spots by hand |

Priority: Now, Spreading, Water, Too wet, Look at, Re-check, Check by hand, No soil data. Show at most 5 cards; the rest go under "Can wait".

The app never invents a pesticide, fungicide or fertiliser product or dose. Chemical options appear only from the user's own product list with label rates entered by the user, and the card says "follow the label". Cultural steps come first.

### Diagnosis hints for tomato

What the camera can see, and how an agronomist would read it. The low camera mostly sees lower leaves, so symptoms that start on young upper leaves go to "check by hand".

| Camera sees | Likely cause | Could also be | How to tell | First safe step |
| --- | --- | --- | --- | --- |
| Oldest, lowest leaves pale green to yellow, evenly, no spots; new leaves green | nitrogen shortage (nitrogen moves from old to new leaves) | too much water; magnesium shortage | even yellow, or yellow between green veins (magnesium)? any spots? wet soil? | check the fertiliser plan with an agronomist |
| Brown spots up to about 1/2 inch on older leaves, with concentric rings and yellow tissue around them | early blight | Septoria leaf spot | rings and spot size | remove affected lower leaves; help leaves dry quickly |
| Many small spots (about 1/8 inch) on lower leaves after fruit set: grey centres, dark borders, tiny black specks | Septoria leaf spot | early blight seen from a distance | small speckled spots without rings | water at the base; don't work plants while leaves are wet; remove infected leaves |
| Young leaves yellow at the edges, curled upward, small; plant stunted | tomato yellow leaf curl virus, spread by whiteflies | potassium or magnesium deficiency | whiteflies on the leaves; upper leaves seen on the field walk | mark the plant; tell an agronomist or extension officer |
| Plant droops in the hottest hours and recovers at first; leaves stay green; soil not dry | bacterial wilt | water stress (but then the soil is dry) | cut a fresh stem and stand it in clear water: a milky stream appears within minutes | mark it and tell an agronomist; the bacteria can spread through irrigation water |

Hints from extension guides: early blight ([Oklahoma State](https://extension.okstate.edu/programs/digital-diagnostics/plant-diseases/early-blight-of-tomato), [Colorado State](https://extension.colostate.edu/resource/tomato-early-blight/)), Septoria ([Oklahoma State](https://extension.okstate.edu/programs/digital-diagnostics/plant-diseases/septoria-leaf-spot), [Maryland](https://extension.umd.edu/resource/septoria-leaf-spot-tomatoes)), nitrogen and magnesium ([Iowa State](https://yardandgarden.extension.iastate.edu/identifying-plant-nutrient-deficiencies/older-leaves/effects-mostly-generalized/nitrogen), [Missouri Botanical Garden](https://missouribotanicalgarden.org/gardens-gardening/your-garden/help-for-the-home-gardener/advice-tips-resources/pests-and-problems/environmental/nutrient-deficiencies-in-tomatoes)), leaf curl virus ([UF U-Scout](https://plantpath.ifas.ufl.edu/u-scout/tomato/tomato-yellow-leaf-curl.html), [NC State](https://content.ces.ncsu.edu/tomato-yellow-leaf-curl-virus)), bacterial wilt ([UF U-Scout](https://plantpath.ifas.ufl.edu/u-scout/tomato/bacterial-wilt.html), [Oklahoma State](https://extension.okstate.edu/programs/digital-diagnostics/plant-diseases/bacterial-wilt-of-tomatoes)).

### Plant record, field walk and round report

- **Plant record** (Plants tab): one timeline per plant with photos from the same angle, soil readings, symptoms, actions and outcomes, plus a slider to compare with the last round.
- **Field walk** (phone): flagged plants in walking order, each with a large photo and three buttons: Confirmed, Not it, Fixed. Works offline and syncs later.
- **Round report:** one page per round (plants checked, actions, water used, findings, rover issues) as PDF and CSV, kept as farm records.
- **Feedback:** every Done, Later and Wrong is stored with its evidence, and the Lab reports how often the advice was right.

## The real rover: hardware profile

The default profile is read from the rover photo and public datasheets, and every value is a parameter the user will overwrite with measurements. The photo shows a white 3D-printed frame and a camera in a white case on a raised bracket (ESP32-CAM style, OV2640). It also shows a blue shrink-wrapped Li-ion pack (3S, given the 11.1 V in the UI), a red L298N dual H-bridge with a black heatsink, a controller board, yellow TT gear motors with black wheels, and a threaded rod (assumed to drive the soil probe).

| Parameter | Default | Basis |
| --- | --- | --- |
| Mass *m* | 1.2 kg | estimate – weigh |
| Wheel radius *r* | 0.0325 m | 65 mm TT wheel – measure |
| Track width *B* (wheel centres) | 0.17 m | estimate – measure |
| Wheelbase *L* | 0.14 m | estimate – measure |
| Body length × width | 0.24 × 0.20 m | estimate |
| Centre of gravity height | 0.07 m | estimate |
| Drive | 4 × TT 1:48; left pair and right pair each on one L298N channel | photo |
| Motor at 6 V | 250 rpm and 0.16 A no-load, 1.5 A stall | [Adafruit 3777](https://www.adafruit.com/products/3777) bench measurement |
| Rated stall torque at 6 V | 0.8 kgf·cm = 0.0785 N·m | Adafruit 3777 specification |
| Driver drop, typical | 1.4 + 1.15·*I* V (2.55 V at 1 A, 3.7 V at 2 A) | source + sink saturation, [LM18298](https://www.logosfoundation.org/instrum_gwr/korn/LM18298.pdf) (pin-compatible L298N) |
| Driver limits | 2 A DC per channel; quiescent 13–50 mA from the motor supply, 7–24 mA from 5 V | [ST L298 datasheet](https://www.ece.nus.edu.sg/ee3032/html/Common/L298datasheet.pdf) |
| Battery | 3S1P 18650, 2.5 Ah, pack resistance 0.20 Ω | estimate – read the cell label |
| Camera | OV2640, 65° diagonal, 4:3, 800 × 600 | stock lens, [M5Stack ESP32-CAM](https://docs.m5stack.com/en/unit/esp32cam?id=video) |
| Camera mount | 0.17 m high, 0.10 m ahead of centre, tilt 0° | estimate – measure |
| Camera mast | natural frequency 12 Hz, damping ratio 0.06 | estimate (PLA bracket) |
| 5 V loads | ESP32-CAM 0.20 A, controller 0.08 A, L298N logic 0.024 A, sensors 0.01 A | ESP32-CAM draws 180 mA at 5 V with flash off ([DFRobot](https://wiki.dfrobot.com/dfr0602/)); rest estimate |
| 5 V source | buck converter, 85 % efficient | assumption – confirm |
| Wi-Fi radio | 17 dBm transmit (802.11b); sensitivity −90 dBm at 1 Mbps, −70 dBm at 54 Mbps | DFRobot ESP32-CAM specification |
| Probe | capacitive v1.2 blade, tip 23 × 1.6 mm, 60 mm stroke, mounted between the axles | board 98 × 23 mm ([DFRobot SEN0193](https://www.dfrobot.com/product-1385.html)) – confirm mount |
| Probe drive | M8 threaded rod (1.25 mm lead), screw efficiency 0.20, TT motor | assumption |
| Other sensors | MPU-6050 IMU, front bumper switch, rain sensor | assumption – confirm |

Derive the motor constants in code from the five bench numbers; never hard-code them. Here ω\_nl is the motor-shaft speed (250 rpm × 48) and G = 48.

```latex
R = \frac{V_{test}}{I_{stall}} \qquad K_e = K_t = \frac{V_{test} - I_{nl}R}{\omega_{nl}} \qquad \tau_f = K_t\,I_{nl} \qquad \eta_g = \frac{\tau_{stall}}{G\,K_t\,(I_{stall}-I_{nl})}
```

With the defaults: R = 4.0 Ω, K = 4.27 mV·s/rad, τ\_f = 0.68 mN·m, gearbox efficiency η\_g = 0.29, and 2.41 N of stall force per wheel.

### What to measure on the real rover

- [ ] Weigh the rover. Balance it on a pencil, front to back, to find the centre of gravity.
- [ ] Measure wheel radius, track width and wheelbase.
- [ ] Motors on a 6 V bench supply: no-load rpm (phone slow-motion video) and current; stall current for one second only.
- [ ] Battery: read the cell label (Ah). Pack resistance = voltage drop ÷ current step when the motors start.
- [ ] 5 V rail with a USB power meter: idle, streaming, capturing.
- [ ] Pull test on your lane soil with a luggage scale: wheels locked (μ), pulled sideways (μ\_lat), free rolling (C\_rr).
- [ ] Pivot test: equal and opposite wheel speeds; the gyro yaw rate gives χ (see wheel–soil section).
- [ ] Probe push test: field soil in a tray on a kitchen scale; push the probe 60 mm; peak reading in kg × 9.81 = newtons.
- [ ] Wi-Fi walk: log the ESP32's RSSI every 10 m away from the access point.
- [ ] Camera: photograph a ruler at 0.40 m to get the real field of view and pixels per millimetre.

## UX redesign: advice first, robot second

After a round, the Rover page opens on Advice: the agronomist's report, with a short action list and a field map. While a round runs, the live 3D Round view takes over. Robot details stay one tap away, and the E-stop never leaves the top bar.

### What is wrong today

- It reports what the robot did, not what the farmer should do.
- The same number appears up to four times: stops 15/97 in the banner, the red overlay, the stats bar and the footer. Battery appears in four places.
- Sentences everywhere: the banner, the "stops itself on" list, the checklist, the footer note.
- The 3D view gets under half the screen, and three overlays cover it.
- Planning (route, camera) and the live run share one column.
- Mixed nouns: "trees" and "plants", "T1" and "R1 T1".
- "Battery 11.10 V · 0%" is physically wrong. A 3S pack at 11.10 V is about 37 % charged at rest, or about 64 % under a 1.5 A load.

### Principles

1. Decisions, not data: lead with what to do, where, how much, by when, and why.
2. Readable in two seconds from two metres.
3. Each metric appears once, where the eye expects it.
4. Labels have at most three words. An advice card holds two short lines plus a Why line. Longer sentences live only in Why panels, tooltips and the help drawer.
5. State is colour + icon + word, never colour alone.
6. Evidence and confidence are always one tap away. Never hide uncertainty.
7. Safety controls never move: E-stop top right, on every tab.
8. In the Round view, show the physics instead of describing it: camera frustum, wheel dust, battery sag, position uncertainty.

### Advice view (default after a round)

```text
+-----------------------------------------------------------------------------+
| Rover   [Advice]  Round  Plants  Hardware  Lab    Docked 64%   ( STOP )     |
+-----------------------------------------+-----------------------------------+
| T1 Tomato v   Today 06:40, 97/97 seen   | Field map (1 mark = 1 plant)      |
|                                         |                                   |
| Today: 3 things to do                   | R1  o o o o o o o o o o o o o o   |
|                                         | R2  o o o o o o ! o o o o o o o   |
| 1  Water 6 plants in row 3       Today  | R3  o o o o w w w w w w o o o o   |
|    5.3 L each, about 2 h 40 min drip    | R4  o o o o o o o o o o o o o o   |
|    Why: dry two rounds in a row         | R5  o o . o o o o o o o o o o o   |
|    [Done]  [Later]  [Wrong]             |                                   |
|                                         | o fine   w water   ! look at      |
| 2  Look at plant R2-P07          Today  | . not checked                     |
|    Yellow lower leaves       [photo]    |                                   |
|    Likely low nitrogen                  | Water today: 32 L for 6 plants    |
|    Spots with rings? Then blight        | (all 97 at this dose: 517 L)      |
|                                         |                                   |
| 3  Re-check row 4, watered Tue    Next  |                                   |
|                                         |                                   |
| 89 fine   1 not checked  [Field walk]   |                                   |
+-----------------------------------------+-----------------------------------+
```

The field map is a sketch (the real block has 20 spots per row). Hovering a card lights up its plants on the map; tapping a plant opens its record. On a phone, the cards stack, the map folds under them, and Field walk opens the flagged plants in walking order.

### Round view (while the rover works)

```text
+----------------------------------------------------------------------------------------------+
| Rover    Advice  [Round]  Plants  Hardware  Lab     Scouting        64%    ( STOP )          |
+---+--------------------------------------------------------------+---------------------------+
| o | T1 Tomato 5x20 v     3D  Top  Eye  Follow      Layers v      | Plan C: shared lanes      |
| o |                                                              | 33 m   25 min   1.8 Wh    |
| o |                                       +---------------+      |                           |
| o |           3D field, full bleed        |  Rover's eye  |      | Now     R2-P07, probing   |
| o |                                       +---------------+      | Used    1.1 of 1.8 Wh     |
| o |   (!) Soil too hard, R2-P07   07:12                          | Found   2 to look at      |
| o |                                                              |                           |
|   |  (Battery 11.4 V) (0.15 m/s) (Slip 4%) (Tilt 3)              |                           |
|   |  > 1x 10x 60x  [##########...........]  31 of 97  12:40 left | [Pause]  [Home]  [Stop]   |
+---+--------------------------------------------------------------+---------------------------+
```

Before a round, the right panel is the Plan, Check and Go stepper. When the round ends, the page switches to Advice with a one-line outcome ("Complete" or "Partial: low energy").

### Components

| Component | Shows | Behaviour |
| --- | --- | --- |
| Top bar | tabs, rover chip (Docked; Scouting, with progress when another tab is open; or Stopped with a reason) with battery %, E-stop | the only place rover state and battery % appear |
| E-stop | red button on a yellow collar, the machine-safety convention | one tap stops; once engaged it becomes Release, which needs a 1.5 s hold and a new check |
| Block and round picker | block, round time, coverage ("Today 06:40, 97/97 seen") | pick an earlier round to compare |
| Advice card | see the agronomist section | Done, Later, Wrong; tap Why for the evidence |
| Field map | top-down grid, one mark per plant, coloured by status | tap a plant to open its record |
| Value line | water today against the same dose on every plant | computed by the advice engine |
| Plant record | photos from the same angle, soil readings, symptoms, actions, outcomes | opens from the map, a card or the timeline |
| Field walk | flagged and unchecked plants in walking order | phone first; works offline |
| View switch (Round) | 3D, Top, Eye (rover camera), Follow | Top is an orthographic map with the same layers |
| Layers (Round) | path, moisture map, camera coverage, Wi-Fi, position uncertainty, wheel slip | toggles, remembered per user |
| Rover's eye (Round) | picture-in-picture rendered from the real camera intrinsics | tap to swap with the main view |
| Gauges (Round) | battery ring (fill shows charge; V, A, W, time to floor), speed, slip, tilt | ring turns amber at the return reserve, red at the floor |
| Timeline (Round) | one tick per plant, coloured by result; play; 1×, 10×, 60×; drag to replay | hover a tick to see the plant card |
| Mission panel (Round) | Plan, Check, Go stepper before a round; plan, progress and Pause, Home, Stop during it | numbers come live from the planner |
| Check step | eight tiles: Wi-Fi, Battery, E-stop, Dry, Lanes clear, Start pose, Lens clean, Probe clean; energy bar (needed plus reserve vs available) | automatic tiles turn green from telemetry; manual tiles need a tap |
| Toasts | icon, up to four words, time ("Soil too hard", "Slip 42 %", "Going home") | stack top centre; tap opens the details drawer |

### States

| State | What changes |
| --- | --- |
| No round yet today | Advice shows the last round, greyed, with the next scheduled round and a Start button |
| Advice ready | default after a round: cards, map, value line |
| Checking | Round view; tiles fill in; Start stays disabled until all are green |
| Running | Round view; panel shows plan and progress; Follow view offered |
| Paused | amber frame; timeline stops |
| Going home | dashed amber path home with arrival time |
| Safe stop | red frame and reason toast; panel shows Release |
| Round ended | switches to Advice with the outcome on top |
| Live, signal lost | everything greys except the last known pose and an age badge ("12 s old") |

### Tabs

- **Advice** (default when no round is running): the agronomist's report for the selected round.
- **Round** (default while a round runs; was Daily round): the live 3D mission view.
- **Plants** (absorbs Growth and History): one record per plant, filterable by status.
- **Hardware** (was What it does): CAD inspector and capability cards.
- **Lab** (was Test): scenario runner and side-by-side comparisons.
- **SOP** moves into a help drawer (? in the top bar) as illustrated steps.

Words: Block, Row, Plant, Spot, Lane, Stop, Round. IDs look like R1-P01. Use farmer units (litres, minutes, rows, "today"); raw values such as θ or volts appear only in Why panels, Round gauges and the Hardware tab. Use sentence case. Error details say what happened and what to do next ("Soil too hard. Probe skipped. Try after irrigation."). On screens narrower than 768 px the E-stop floats bottom right at 64 px.

## Visual language: daylight field instrument

A light, sun-readable frame around the 3D field, status colours taken from the crop itself, and one loud element: the red-on-yellow E-stop. The 3D twin is the memorable thing; everything around it stays quiet.

### Colour tokens

| Token | Hex | Use | Contrast on #F5F7F2 |
| --- | --- | --- | --- |
| field-white | #F5F7F2 | page; panels use #FFFFFF with a 1 px #D6DCD3 border | – |
| ink | #17261C | primary text (leaf-shadow green) | 14.6:1 |
| ink-2 | #56645B | secondary text, units | 5.8:1 |
| leaf | #2E7D32 | healthy, go, done | 4.8:1 |
| drip-blue | #1D6FB0 | water, moisture, needs water | 4.9:1 |
| flower-yellow | #E2A700 | look at, attention, return reserve (fill only, ink text on it at 7.3:1) | fill only |
| tomato-red | #CF2A1E | stop, fault, E-stop button (white text 5.3:1) | 4.9:1 |
| stake | #A08F78 | not reached, disabled (fill only) | fill only |
| collar-yellow | #F2C200 | E-stop collar only | fill only |

### Type

- **Atkinson Hyperlegible** (400, 700) for all interface text. It was drawn for legibility, with clearly different I, l, 1, 0 and O, which matters in sunlight.
- **Barlow Semi Condensed** (500, 600, tabular figures) for numbers in gauges, the timeline and plan cards. Signage roots, narrow enough for big numerals.
- Thai strings later: Anuphan or IBM Plex Sans Thai.
- Scale in px: 12, 14, 16, 20, 25, 31, 39. Body 14 on 20 line height. Gauge numerals 31 or 39. Units in ink-2 at 70 % of the number's size.
- Sentence case everywhere. No all-caps overlay titles like "SIMULATION · LOW BATTERY TEST", no middle-dot meta strings, no monospace labels.

### Shape, space and depth

- Text is left-aligned; numbers are right-aligned in tables.
- Radius follows role: panels 12 px, buttons 8 px, chips 6 px, E-stop and gauges round.
- No drop shadows on panels. Panels over the 3D view are white at 92 % opacity with a 12 px backdrop blur, so text stays readable over foliage. The 3D scene supplies the depth.
- Spacing on a 4 px grid: 4, 8, 12, 16, 24, 32.

### Motion

- One orchestrated moment: when a round starts, the camera eases from the overview into the Follow view (1.2 s) while the route draws itself along the lanes.
- Everything else moves only in answer to an action or a real event: toasts slide in over 160 ms; stepper panels open over 200 ms, ease-out.
- Safety-critical values never animate. E-stop state, battery voltage and fault frames change instantly.
- With `prefers-reduced-motion`, camera flights become cuts and particles are off.

### Access

- WCAG AA for all text. Colour is never the only signal.
- Touch targets at least 44 px; the E-stop is 64 px.
- Keyboard: visible 3 px leaf focus ring. Space or Esc triggers the E-stop while the Rover page has focus; Release always needs the 1.5 s hold.

## 3D rover model and field

Build the rover procedurally from primitives that match the photo. Every moving part is driven by simulation state; nothing animates on its own.

### Parts

| Part | Geometry and material | Driven by |
| --- | --- | --- |
| Frame | white PLA (#F2F0EA, roughness 0.7), two side frames with lightening holes, deck plate | static |
| Wheels × 4 | black rubber, radius 32.5 mm, width 26 mm, tread bumps | wheel angle += ω\_wheel · dt per wheel, so slip is visible: the wheel turns faster than the ground moves |
| TT motors × 4 | yellow gearbox 70 × 22 × 18 mm | slight vibration proportional to current |
| Battery | blue cylinder pack | glowing charge band = SoC; amber below the return reserve |
| L298N | red board, black finned heatsink | heatsink tint by driver temperature (level 2) |
| Controller and wires | dark board; wires as tubes | static |
| Camera | white box on a bracket, 0.17 m high | pan angle (servo mode) or whole-body yaw; frustum while aiming |
| Probe | threaded rod, carriage, blade | carriage height = probe depth; rod spins by depth ÷ lead × 2π |
| Bumper | front bar | flashes red on contact |
| Status LED | small dome | colour = mission state |

### Physics you can see

- **Body pose:** the chassis rests on the four wheel contact points (fit a plane through them), so pitch and roll follow the ground.
- **Probe lift:** when the probe force exceeds the lift limit, the body pitches up about the far axle by the computed angle, then settles when the probe retracts.
- **Slip:** dust (dry) or mud flecks (wet) from each wheel at a rate proportional to slip × wheel speed. Ruts as a ground decal whose darkness follows sinkage.
- **Camera frustum:** a translucent pyramid while aiming; the part of the target plant inside it is highlighted.
- **Position uncertainty:** a 2σ ellipse under the rover, from the estimator covariance.
- **Path:** planned as a dashed line; driven as a solid ribbon coloured by energy per metre.

### Field

- **Ground:** height field on a 2 cm grid. Bed profile is a block setting: flat, or raised beds (0.15 m high, 0.5 m top, 45° sides) with optional black mulch film and a drip line.
- **Plants:** instanced. Growth stage sets height (0.15 m at transplant to 1.0 m when fruiting, default) and canopy radius (0.10 to 0.35 m). One stake per plant and a status ring at its base.
- **Light:** sun plus sky hemisphere, soft shadows, ACES tone mapping. A time-of-day control moves the sun; light level feeds camera exposure and therefore motion blur.
- **Budget:** 60 fps on an integrated GPU at 1440p for a 5 × 20 block; at most 150 draw calls; plant level-of-detail beyond 15 m.

### Hardware tab: CAD inspector

- Exploded-view slider. Hover a part to outline it; click it for a card with mass, power, live current and what to measure.
- Power-flow X-ray: animated lines battery → driver → motors, line thickness proportional to current.
- Capability cards: max slope, max step, energy per round, turn margin on the current soil, and the probe envelope chart (force needed vs soil moisture, with the lift limit drawn as a line).

## Simulation architecture

One deterministic engine in plain TypeScript runs in a Web Worker and feeds the UI through a telemetry interface that the real rover will implement later. Telemetry carries only what the real rover could report; simulation truth travels separately so the UI cannot cheat.

```text
src/features/rover/
  sim/                    plain TypeScript, no React or three.js
    profile.ts            RoverProfile, FieldProfile, soil table, defaults (SI)
    rng.ts                seeded mulberry32 + Gaussian, one stream per subsystem
    battery.ts            OCV curve, sag, SoC truth and estimate
    motor.ts, driver.ts   DC motor, gearbox, L298N, 5 V rail
    soil.ts               grid of moisture, cone index, Crr, mu; rain and drying
    vehicle.ts            forces, slip, skid-steer kinematics, body pose
    estimator.ts          EKF on x, y, yaw, gyro bias
    control.ts            speed profile, heading and lane keeping, pivots
    camera.ts             intrinsics, frustum, coverage, blur, detection
    probe.ts              lead screw, force, lift, reading
    agronomy.ts           water balance, proposals, plant truth
    link.ts, weather.ts   Wi-Fi model and heartbeat; rain events
    planner.ts            route strategies, time and energy budgets
    mission.ts, safety.ts state machine, triggers, reports
    engine.ts             fixed-step loop, event log, snapshots
    worker.ts             Web Worker wrapper, fast-forward
    __tests__/            Vitest: reference numbers and scenarios
  twin/
    telemetry.ts          RoverTelemetry type, TelemetrySource interface
    simSource.ts          wraps the worker
    liveSource.ts         WebSocket stub with the same messages
  ui/  three/  store.ts
```

| Loop | Rate | Note |
| --- | --- | --- |
| Physics | 200 Hz (dt = 5 ms), semi-implicit Euler | fixed step, never tied to frame rate |
| Motors and driver | 200 Hz, quasi-static | the motor's electrical time constant (about 1 ms) is shorter than dt |
| Control | 50 Hz | same rate as the firmware loop |
| Mission and safety | 10 Hz | evaluates every trigger |
| Telemetry to UI | 10 Hz | what Wi-Fi would carry; render at 60 fps with interpolation |

At 60× a 70-minute round plays in about 70 s. "Skip to end" runs headless and finishes one round in under 3 s.

```ts
export type MissionState = 'idle' | 'checking' | 'drive' | 'align' | 'aim' | 'capture'
  | 'probeDown' | 'read' | 'probeUp' | 'goingHome' | 'paused' | 'safeStop' | 'done';

export interface RoverTelemetry {              // what the real rover can report
  t: number;                                   // s since mission start
  poseEst: { x: number; y: number; yaw: number; cov: [number, number, number] }; // var x, y, yaw
  imu: { pitch: number; roll: number; yawRate: number };
  wheels: { omegaCmd: [number, number]; omegaEnc?: [number, number, number, number] };
  motors: { current: [number, number, number, number]; duty: [number, number] };
  battery: { vTerm: number; current: number; socEst: number };
  probe: { z: number; force: number; state: 'up' | 'down' | 'reading' | 'abort' };
  camera: { pan: number; capturing: boolean };
  link: { rssi: number; lossPct: number; heartbeatAge: number };
  mission: { state: MissionState; stopIndex: number; reason?: string };
  events: RoverEvent[];                        // since the previous packet
  truth?: {                                    // simulation only, for the Lab overlay
    pose: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };
    v: number; slip: [number, number, number, number]; soc: number;
  };
}

export interface TelemetrySource {
  subscribe(cb: (t: RoverTelemetry) => void): () => void;
  command(c: RoverCommand): void;              // start, pause, home, estop, release
}
```

- One seeded stream per subsystem, so changing one model does not shift another model's noise.
- The UI shows estimates, as it would with the real rover. Only the Lab may overlay `truth`.
- Export a 10 Hz run log (CSV and JSON): time, true pose, estimated pose, speed, SoC, voltage, current, slip, state. The same seed and parameters give an identical log hash.

## Drivetrain: battery, L298N, motor, wheel

Each side's two TT motors share one L298N channel and run open-loop on PWM, so speed drops when the battery sags or the soil pulls harder, exactly as on the real rover.

Battery terminal voltage (3 cells in series):

```latex
V_b = 3\,\mathrm{OCV}(SoC) - I_b\,R_{pack}
```

Driver drop and motor voltage at PWM duty d, with two motors in parallel on a channel (I\_ch = 2I):

```latex
V_{drop} = 1.4 + 1.15\,I_{ch} \qquad V_m = d\,(V_b - V_{drop}) = I R + K_e\,\omega_m
```

Torque and speed through the 1:48 gearbox:

```latex
\tau_{wheel} = G\,\eta_g\,(K_t I - \tau_f) \qquad \omega_{wheel} = \frac{\omega_m}{G}
```

Battery current (PWM draws only during on-time):

```latex
I_b = \sum_{ch} d_{ch}\,I_{ch} + \frac{P_{hotel}}{V_b}
```

Each physics step, take the duty per side from the controller and solve the motor point together with the wheel–soil force from the next section. Two or three fixed-point iterations per step are enough.

- **Voltage cap:** firmware caps the average motor voltage at 6.0 V, the TT rating. Uncapped, the motors would see about 9.1 V (153 % of rating); show a warning chip if the cap is switched off.
- **Deadband:** a motor starts only when K\_t · I exceeds 1.5 τ\_f (static friction). At very low duty the rover must visibly stall.
- **Spread:** scale each motor's no-load speed and resistance by a seeded N(1, 0.05²). This is what makes an open-loop rover curve.
- **Driver over-current:** I\_ch above 2.0 A (the L298N DC rating per channel) for more than 1 s raises a warning.
- **Stall:** I above 0.9 I\_stall for more than 1 s stops that action to protect the motor.
- **5 V rail:** with a buck converter, battery power = P\_5V ÷ 0.85. If the user picks the L298N board's onboard linear 5 V regulator, battery power = V\_b · I\_5V and the regulator dissipates (V\_b − 5) · I\_5V, about 2 W. Flag that as "regulator overheats, camera brown-outs".
- **Hotel power** with the defaults is 2.2 W from the battery: 1.57 W on the 5 V rail through the buck, plus 0.03 A × V\_b of L298N quiescent current.

## Wheel–soil contact, motion and turning

Motion comes from forces and slip, not from the commanded speed: the same command moves the rover differently on packed soil, loose soil and mud.

| Surface | C\_rr (rolling) | μ (traction) | μ\_lat (sideways) | s₀ (slip scale) |
| --- | --- | --- | --- | --- |
| Packed lane (default) | 0.06 | 0.60 | 0.55 | 0.12 |
| Loose tilled | 0.15 | 0.55 | 0.50 | 0.18 |
| Wet mud | 0.25 | 0.35 | 0.35 | 0.25 |

All four columns are estimates; fit them with the pull test. The soil is a 0.25 m grid. Each cell holds moisture θ and a kind (packed lane, loose tilled, or bed). Its coefficients start from its kind's row and blend toward the mud row as θ rises from 0.32 to 0.40. Rain raises θ; sun and plants lower it.

Longitudinal balance for the whole rover (α = ground slope along the heading):

```latex
m\,\dot v = \sum F_x - C_{rr}\,m g\cos\alpha - m g \sin\alpha
```

Slip from the traction each wheel must deliver (a simplified, invertible Janosi–Hanamoto shear curve). When F\_x reaches μN the wheel spins (s → 1) and the rover is stuck.

```latex
\frac{F_x}{N} = \mu\left(1 - e^{-s/s_0}\right) \;\Rightarrow\; s = -s_0 \ln\!\left(1 - \frac{F_x}{\mu N}\right)
```

Kinematics: the extended differential-drive model for skid steer (Mandow et al., 2007), with traction slip applied to each side. χ = 1 is an ideal differential drive; the default is 1.6. Fit it from the pivot test: χ = r(ω\_R − ω\_L) ÷ (B · measured yaw rate).

```latex
v = \frac{r}{2}\left[\omega_R(1-s_R) + \omega_L(1-s_L)\right] \qquad \dot\psi = \frac{r\left[\omega_R(1-s_R) - \omega_L(1-s_L)\right]}{\chi B}
```

Turning resistance: in a pivot the four corner wheels slide sideways, and each side must push with F\_side:

```latex
M_r = \mu_{lat}\, m g \,\frac{L}{2} \qquad F_{side} = \frac{M_r}{B} + \frac{C_{rr}\, m g}{2}
```

The outer side only has μ · mg/2 of traction, which gives the turn margin:

```latex
\text{turn margin} = \mu - \left(\mu_{lat}\frac{L}{B} + C_{rr}\right)
```

- **Packed lane, +0.09:** the rover pivots, with about 23 % slip and close to 1 A per motor. That is 2 A per L298N channel, right at its DC limit.
- **Loose soil, −0.01:** on the edge. The wheels dig and the yaw rate collapses.
- **Mud, −0.19:** it cannot pivot.

When the margin is negative, show the wheels spinning and the yaw rate collapsing. The planner must then use arc turns (radius ≥ B) or report "Can't turn here".

Capability limits for the Hardware tab:

- **Climb, traction-limited:** tan α = μ − C\_rr, so 28° packed, 22° loose, 6° in mud.
- **Climb, motor-limited** at 50 % of stall force continuously: 15° on loose soil.
- **Step:** about half the wheel radius, 16 mm. A 15 cm raised bed cannot be crossed, so "Across rows" is disabled on raised beds and says why.
- **Speed:** 0.15 m/s cruise by default; 0.66 m/s maximum under the 6 V cap.
- **Tipping:** static limit tan φ = (B/2) ÷ h\_cg = 1.21, about 50°. Tilt alarm at 25°.

## Battery, energy and the return-home reserve

State of charge comes from an OCV curve plus coulomb counting. The rover heads home when the energy to get there, times 1.5, would cut into a 10 % floor – never at a fixed voltage like today's 11.1 V.

Today's rule wastes the pack: 11.10 V is about 37 % charged at rest and about 64 % under a 1.5 A load. A 2.5 Ah pack holds about 28 Wh, while the trip home from the far corner of T1 costs about 0.16 Wh.

```ts
// Rested open-circuit voltage per cell: generic 18650 Li-ion, 25 °C, 30 min rest.
// Cold shifts the curve down by 0.2–0.3 V. Replace with your cell's own curve.
export const OCV_SOC = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];          // %
export const OCV_V   = [3.00, 3.49, 3.61, 3.67, 3.71, 3.74, 3.78, 3.83, 3.96, 4.08, 4.20];
```

The curve is the rested table from [Zbotic's SOC guide](https://zbotic.in/how-to-read-battery-state-of-charge-voltage-vs-actual-capacity/). The truth model, with Q in Ah:

```latex
SoC_{k+1} = SoC_k - \frac{100\,I_b\,\Delta t}{3600\,Q} \qquad V_b = 3\,\mathrm{OCV}(SoC) - I_b R_{pack}
```

The estimate is what firmware can know: coulomb counting with a seeded ±3 % current-sensor gain error. After 30 s below 0.3 A, blend toward the SoC whose OCV equals (V\_b + I\_b R\_pack) ÷ 3. The UI always shows the estimate.

### Energy per action

| Action | Cost with defaults |
| --- | --- |
| Electronics, always on | 2.2 W |
| Drive on packed lane | 16.5 J/m for motors; 31 J/m with electronics at 0.15 m/s |
| Drive on loose soil, in mud | 35 J/m, 72 J/m for motors |
| Pivot 90° on packed lane | 65 J (28.8 W for 2.25 s) |
| Probe cycle, 60 mm down and up | 62 J over 29 s |
| Camera pan 90° with a servo | about 0.2 J |

Two pivots per plant (look, then turn back) cost 130 J, about 16 times the 8 J the motors need to drive 0.5 m to the next plant. That one fact makes the camera mode the biggest energy decision.

### Low-battery logic

```latex
E_{avail} = \frac{SoC_{est} - 10}{100}\,E_{pack} \qquad E_{home} = d_{home}\,e_{drive} + n_{pivot}\,E_{90} + P_{hotel}\,t_{home}
```

- Go home when E\_avail minus the next stop's energy is less than 1.5 · E\_home. Re-check at every stop, using the planner's real path home.
- Stop at once when the loaded voltage, averaged over 2 s and corrected by + I\_b R\_pack, stays below 3.3 V per cell (9.9 V).
- Never act on a single sample: one pivot sags the pack by about 0.5 V.
- Pre-start check: SoC\_est must be at least 10 % + 100 × (round energy + 1.5 E\_home) ÷ E\_pack. That is 40 % for today's plan and 17 % for the shared-lane plan (see Mission logic).

## Localization, heading control and stop accuracy

An open-loop TT rover leaves its lane after about one metre, so heading control, landmarks and an estimator are part of the twin, not extras.

Why, computed with the defaults:

- **No gyro, 5 % motor mismatch:** the rover yaws 1.6°/s and uses up its 0.10 m lane clearance after 7 s, about 1.0 m.
- **Gyro heading hold alone:** a 1° heading error at the row start becomes 0.17 m sideways over a 9.5 m row. It still needs a row reference.
- **Along the row, at the row end:** time-based dead reckoning (±10 % speed) is off by 0.95 m. Encoders with uncompensated slip are off by 0.12 m on packed soil and 0.54 m on loose soil.
- **Tolerance:** the plant must sit in the middle 60 % of the image, which is ±0.12 m along the row.

Sensor models:

- **Gyro (MPU-6050):** white noise 0.005 °/s/√Hz ([TDK spec](https://www.datasheets.com/tdk/mpu-6050)). Initial zero-rate offset up to ±20 °/s ([datasheet summary](https://www.ultralibrarian.com/?p=28422)), so calibrate for 2 s at start. Temperature drift: seeded N(0, 0.02²) °/s per °C (estimate). Re-zero the bias at every stop where the rover is still for at least 1 s.
- **Wheel encoders (optional):** N slots per revolution, quantized. They count wheel turns, so slip becomes odometry error.
- **Row-end tags (optional):** ArUco markers on stakes; a sighting gives position σ = 1 cm and heading σ = 0.5°.
- **Plant centering (optional):** stem detection in the camera image, σ = 2 cm along the row, no drift.
- **Side distance (optional):** a ToF sensor to the bed edge or stems, σ = 1 cm.
- **Estimator:** EKF on x, y, yaw and gyro bias. Draw its 2σ ellipse under the rover.

| Lab preset | Sensors | Expected along-row error at row end |
| --- | --- | --- |
| P0 | time only | leaves the lane after about 1 m |
| P1 | gyro | straight for a few metres; about 0.95 m |
| P2 | gyro + encoders | 0.12 m packed, 0.54 m loose |
| P3 | P2 + row-end tags | resets each row; within a row as P2 |
| P4 | P3 + plant centering + side ToF | ±0.02 m, no build-up (target) |

Controller, firmware-equivalent, at 50 Hz:

- **Speed:** trapezoidal profile, 0.3 m/s² acceleration, 0.15 m/s cruise.
- **Heading and lane:** a Stanley-style law, with k\_ψ = 2.0 s⁻¹, k\_y = 1.5 and |ω| ≤ 1 rad/s:

```latex
\omega_{cmd} = k_\psi\left(e_\psi + \arctan\frac{k_y\,e_y}{v + 0.05}\right) \qquad \omega_{L,R} = \frac{v \mp \omega_{cmd}\,\chi B/2}{r}
```

- **Pivot:** yaw-rate target 45°/s, yaw acceleration 180°/s², stop on the gyro angle within ±2°, then let the mast settle.
- **Wheel speed to duty:** feed-forward through the inverse motor model, plus a PI loop on wheel speed when encoders exist.

## Camera geometry and plant inspection

The rover's-eye view is rendered from the camera's real intrinsics, so what the rover can see is computed, not assumed. A camera 17 cm off the ground sees only the lower third of a 1 m plant.

With D the diagonal field of view, h the camera height, d the distance to the stem, β the tilt and N\_px = 800:

```latex
\mathrm{HFOV} = 2\arctan\!\left(\tfrac{4}{5}\tan\tfrac{D}{2}\right) \qquad \mathrm{VFOV} = 2\arctan\!\left(\tfrac{3}{5}\tan\tfrac{D}{2}\right)
```

```latex
z_{lo,hi} = h + d\,\tan\!\left(\beta \mp \tfrac{\mathrm{VFOV}}{2}\right) \qquad \frac{px}{mm} = \frac{N_{px}}{2000\,d\,\tan(\mathrm{HFOV}/2)} \qquad t_{settle} = \frac{4}{\zeta\,2\pi f_n}
```

With the defaults, after a 90° pivot the lens sits d = 0.5 − 0.10 = 0.40 m from the stem:

- 65° diagonal gives 54.0° × 41.8°; the frame covers 0.41 × 0.31 m.
- 1.96 px/mm: a 5 mm leaf spot is about 10 px across (detectable); a 1.5 mm whitefly is about 3 px (not).
- Visible slice of a 1.0 m plant: 31 % on a flat field, 17 % on a 15 cm bed, 38 % with a 25° upward tilt.
- Shooting while moving at 0.15 m/s with a 1/60 s exposure smears the image by 4.9 px. Stop and shoot, or keep exposure under 1/500 s.
- After a stop, the PLA mast needs about 0.88 s to settle (12 Hz, damping ratio 0.06).

| Camera mode | Aim and capture per plant | Energy per plant | Note |
| --- | --- | --- | --- |
| Turn rover (today) | 6.6 s: two pivots, settle, 1.2 s capture | 130 J | needs a positive turn margin; scuffs the soil |
| Pan servo (micro servo, about 0.1 s per 60°) | 2.1 s | about 0.2 J | sees both rows from one lane |
| Fixed side camera | 1.2 s | 0 | one side only |
| Two side cameras | 1.2 s for both sides | about 1 W more electronics | a second ESP32-CAM |

Detection: each plant carries a hidden truth – healthy, water stress, nitrogen deficiency (yellowing lower leaves), early blight (spots on lower leaves), or pests. The chance of detecting a symptom rises with its size in pixels and the visible fraction of the affected zone, and falls with blur:

```latex
P_{detect} = \sigma\!\left(a \ln(\mathrm{px}_{symptom}) + b\,f_{visible} - c\,\mathrm{blur}_{px} + k\right)
```

Defaults a = 2, b = 3, c = 0.4, k = −6 (estimates; tune per symptom). A fully visible 10 px spot is then found 83 % of the time and a 3 px pest 31 %. Add 2 % false positives per plant. The Lab reports precision and recall against truth. Symptoms that start low on the plant suit a low camera.

## Soil probe mechanics

The probe can push only as hard as the rover is heavy. With the defaults, the blade probe enters loose bed soil only when θ ≥ 0.28, and never enters walked-on lane soil. The simulation must show this honestly, not hide it.

Screw thrust, with lead ℓ and screw efficiency η\_s, is never the limit: 79 N at TT stall, against roughly 10 N that the rover can resist.

```latex
F_{screw} = \frac{2\pi\,\eta_s\,\tau_{out}}{\ell}
```

The real limit is lift. The rover tips about the axle on the far side of its centre of gravity from the probe (x along the body: x\_a that axle, x\_p the probe, x\_cg the centre of gravity):

```latex
F_{lift} = m g\,\frac{|x_{cg} - x_a|}{|x_p - x_a|}
```

- Probe between the axles: about 0.9 mg = 10.6 N, keeping 10 % of the load on the wheels.
- Probe at the front, 0.12 m ahead of centre: 4.3 N.
- Probe on an arm reaching 0.25 m past the wheels toward the bed: about 3 N before the rover tips sideways.

Force needed at depth z: tip resistance from the soil's cone index CI, plus side friction along the probe's perimeter P:

```latex
F_{need}(z) = k_{shape}\,CI(\theta)\,A_{tip} + \left(c_a + \mu_s K_0\,\gamma\,\tfrac{z}{2}\right) P\,z \qquad CI(\theta) = CI_{ref}\left(\frac{\theta}{0.25}\right)^{-2}
```

Defaults are estimates; calibrate them with the kitchen-scale push test. CI\_ref is 0.25 MPa in tilled bed soil and 1.2 MPa in walked-on lanes; adhesion c\_a = 1 kPa, μ\_s = 0.4, K₀ = 0.5, γ = 15 kN/m³, k\_shape = 1 for a flat blade and 0.6 for a cone tip. Cone index falls as soil gets wetter ([USDA-ARS](https://eprints.nwisrl.ars.usda.gov/id/eprint/688)), so the same probe works after irrigation and fails on a dry afternoon.

| Probe and soil | Needed at θ = 0.25 | Enters when (between axles) |
| --- | --- | --- |
| v1.2 blade (tip 23 × 1.6 mm), bed | 12.4 N | θ ≥ 0.28; never if front-mounted |
| v1.2 blade, lane | 47 N | never: still 16.8 N when saturated (θ = 0.45) |
| Two 3 mm steel rods with cone tips, lane | 11.4 N | θ ≥ 0.26 |
| Two 3 mm steel rods with cone tips, bed | 3.4 N | θ ≥ 0.12 |

&#91;embedded content: computed from the probe equations above with the default parameters; 3 probe and soil cases\]

Below a flat line the rover can push the probe in. The blade gets there only in tilled bed soil wetter than θ = 0.28; in walked-on lane soil it never comes close.

Behaviour in the simulation:

- The carriage descends at screw speed: 4.5 mm/s at 6 V, about 13 s for 60 mm. Force grows with depth by the equation above.
- If F\_need exceeds F\_lift, the body pitches up (visible in 3D), the IMU sees it, and the firmware retracts. Event "Soil too hard"; no reading.
- A good insertion reads θ\_meas = θ\_true (averaged over the sensing length) + a seeded calibration bias + N(0, 0.02²). The raw signal follows a two-point calibration; the v1.2 board outputs about 1.2–2.5 V over its range ([DFRobot](https://www.dfrobot.com/product-1385.html)), lower when wetter.
- Location honesty: the probe samples the lane under the rover, but plants drink from the bed. Model θ\_lane = k · θ\_bed (k = 0.8 for bare soil, 0.5 for drip under mulch). Label proposals from lane readings "lane proxy" with medium confidence.

## Agronomy: soil water and water proposals

Water proposals follow the FAO-56 soil-water balance for tomato, so "0 ml" or "5.3 L" comes from measured depletion, not a guess.

- **Soil (loam):** field capacity θ\_FC = 0.27 and wilting point θ\_WP = 0.12, inside the loam ranges of 0.25–0.32 and 0.09–0.15 ([MPCA](https://stormwater.pca.state.mn.us/index.php/Soil_water_storage_properties)).
- **Root depth:** Z\_r = 0.40 m effective for drip-irrigated tomato. FAO-56 gives 0.7–1.5 m as tomato's maximum ([FAO-56 ch. 8](https://www.fao.org/4/x0490e/x0490e0e.htm)).
- **Crop:** depletion fraction p = 0.40, which FAO says shrinks by 10–25 % in hot, dry weather; mid-season Kc = 1.15 ([FAO-56 ch. 6](https://www.fao.org/4/x0490e/x0490e0b.htm)).
- **Weather:** ET₀ = 4.5 mm/day is an assumption; replace it with your local station's value.
- **Irrigation:** wetted strip 0.30 m wide, so A\_w = 0.5 m × 0.30 m = 0.15 m² per plant; drip application efficiency η\_a = 0.90.

```latex
TAW = 1000\,(\theta_{FC} - \theta_{WP})\,Z_r \qquad RAW = p\,TAW \qquad \theta_{trigger} = \theta_{FC} - p\,(\theta_{FC} - \theta_{WP})
```

```latex
V_{plant}\,[\mathrm{L}] = \frac{(\theta_{FC} - \theta_{root})\,Z_r\,A_w \cdot 1000}{\eta_a}\ \ \text{when } \theta_{root} < \theta_{trigger} \qquad ET_c = K_c\,ET_0
```

With the defaults, TAW is 60 mm and RAW 24 mm, so a plant needs water when θ\_root drops below 0.21. At θ = 0.19 the proposal is 5.3 L for that plant. A plant uses about 2.6 L a day (ETc 5.2 mm over 0.5 m²), so its wetted zone's readily available water lasts about 1.4 days.

The true soil field updates every simulated minute per 0.25 m cell:

```latex
\theta_{t+1} = \theta_t + \frac{P_{rain} + I_{irr} - K_s\,ET_c}{1000\,Z_r} \qquad K_s = \max\!\left(0, \min\!\left(1, \frac{\theta - \theta_{WP}}{\theta_{trigger} - \theta_{WP}}\right)\right)
```

Add a smooth seeded random field so some plants dry faster than others. A plant whose root zone stays below the trigger for two days switches its hidden truth to water stress.

Proposals:

- A probe reading (converted from lane to bed where needed) gives θ\_root directly, with high or medium confidence.
- Stops without a reading use inverse-distance interpolation from probed stops within 1.5 m, with low confidence.
- "Water today" sums high- and medium-confidence plants only. Low-confidence plants are listed as "check by hand".

## Weather, Wi-Fi link and safety triggers

Every stop reason is a physical condition with a threshold and a debounce, checked at 10 Hz, and every stop ends with a saved partial report.

### Wi-Fi link

A low antenna loses signal fast. Model it as dual-slope path loss with a breakpoint, plus foliage loss (Weissberger) and 10 dB for a PCB antenna sitting low on the chassis. f is in GHz and d\_f is the metres of foliage along the path.

```latex
d_b = \frac{4\,h_{ap}\,h_r}{\lambda} \qquad PL(d) = \begin{cases} 20\log_{10}\dfrac{4\pi d}{\lambda} & d \le d_b \\[4pt] PL(d_b) + 40\log_{10}\dfrac{d}{d_b} & d > d_b \end{cases}
```

```latex
L_{fol} = 0.45\,f^{0.284}\,d_f \ \ (d_f \le 14\ \mathrm{m}) \qquad RSSI = P_{tx} + G_{tx} + G_{rx} - PL - L_{fol} - L_{extra}
```

Defaults: access point 2 m high, rover antenna 0.2 m, 17 dBm transmit, +3 dBi at the access point. That puts the breakpoint at 13 m, and RSSI at −52 dBm at 10 m, −69 at 30 m, −78 at 50 m, −83 at 70 m and −90 at 100 m. From the ESP32-CAM sensitivity figures: video is smooth above −70 dBm, telemetry works to about −88 dBm, and below −90 dBm the link is lost. Packet loss follows a logistic curve around each threshold. The Wi-Fi layer draws the coverage map, and the access point can be dragged.

### Weather

Rain is scripted or random (seeded) with an intensity in mm/h. It raises θ in exposed cells within minutes, shifts their soil toward the mud row, and wets the rain sensor.

### Safety triggers

| Trigger | Condition | Action |
| --- | --- | --- |
| E-stop | button or remote command | brake within one physics step; probe stops; latched until Release (1.5 s hold, then a new check) |
| Bumper | switch closed | brake, back off 5 cm, safe stop |
| Lost link | no heartbeat for 3 s | brake and wait; only the user can resume |
| Rain | rain sensor wet for 10 s, or rain in the weather feed | stop probing; go home if the reserve allows, otherwise safe stop |
| Low energy | E\_avail − E\_next < 1.5 E\_home | go home; partial report |
| Critical voltage | 2 s average, I·R-corrected, below 9.9 V | safe stop now |
| Stuck | slip above 0.8 for 3 s while driving | stop; reverse 0.1 m once; otherwise safe stop |
| Motor stall | I above 0.9 I\_stall for 1 s | stop that action; 30 s cool-down |
| Driver overload | I\_ch above 2.0 A for 1 s | halve speed; warn |
| Tilt | roll or pitch above 25° for 0.5 s | safe stop |
| Probe lift | pitch rises more than 2° while probing, or F\_need > F\_lift | retract; "Soil too hard"; continue |
| Command watchdog | no fresh motor command for 0.5 s | motors off (the firmware's run-time limit) |
| Geofence | estimated position outside the block + 0.3 m | safe stop |

Stopping distance comes from coasting: the TT gearbox's friction is hard to back-drive, and with rolling resistance it decelerates the rover at about 3.9 m/s². The L298N's brake adds little at 0.15 m/s, because the back-EMF (about 0.9 V) is below the drop of two saturated transistors.

```latex
d_{stop} = v\,t_{latency} + \frac{v^2}{2a} \qquad a = \frac{4\,\tau_f\,G}{r\,m} + C_{rr}\,g
```

That gives 7 mm for an onboard trigger (30 ms latency) and 40 mm for an E-stop sent over Wi-Fi (250 ms). The bumper needs at least 15 mm of travel.

## Mission logic: route planner and state machine

The planner prices every valid strategy in distance, time and energy before the run. The state machine then executes one stop at a time and can always say why it stopped.

### Strategies for T1

Block T1 has 5 rows × 20 spots and 97 plants, at 1.0 m between rows and 0.5 m between plants. Lanes are packed soil, and the figures assume every probe completes.

| Plan | Lanes | Route + way home | Time | Energy | Rounds per charge |
| --- | --- | --- | --- | --- | --- |
| A: every lane, turn the rover to look, probe every plant (today) | 5 | 54.3 + 14.2 m | 68.5 min | 8.2 Wh | 2.9 |
| B: every lane, pan servo, probe every plant | 5 | 54.3 + 14.2 m | 61.2 min | 4.4 Wh | 5.4 |
| C: shared lanes, pan servo, probe every second stop | 3 | 32.9 + 13.2 m | 25.0 min | 1.8 Wh | 13.5 |

Rounds per charge = 85 % of the 28 Wh pack ÷ round energy. In plan A each plant takes 11 s to reach and photograph, then 29 s to probe: probing is the biggest time cost and pivoting the biggest energy cost. "Across rows" is disabled on raised beds (a 15 cm bed is far above the 16 mm step limit). On flat ground it is allowed only while the gap between plant canopies exceeds the rover width + 0.1 m.

### Route rules

- The rover drives in lanes between rows, never on the plant line.
- U-turn between lanes: overrun 0.35 m into the headland, pivot, cross, pivot. This needs a positive turn margin and at least 0.6 m of headland; otherwise use an arc turn with radius ≥ B.
- A shared lane serves the rows on both sides: pan left, then pan right.
- The way home is part of every plan and every energy check.
- Pivot clearance: the rover sweeps a radius of √(0.12² + 0.10²) = 0.156 m, which must fit inside half the free lane (0.5 m − canopy radius). A fruiting canopy of 0.35 m leaves 0.15 m, so pivots brush leaves; warn in the plan.

### State transitions

| From | Event | To |
| --- | --- | --- |
| idle | Start held for 1.2 s | checking |
| checking | all tiles green | drive |
| checking | any tile red | idle; the tile shows why |
| drive | at the stop, within 2 cm | align |
| align | heading within 2° and mast settled | aim |
| aim | camera on target (pivot or pan done) | capture |
| capture | frames saved (in turn mode, after the pivot back) | probeDown if this stop probes; otherwise drive, or goingHome after the last stop |
| probeDown | full depth reached | read |
| probeDown | lift detected | probeUp, with the event "Soil too hard" |
| read | 3 s of stable readings | probeUp |
| probeUp | carriage up | drive, or goingHome after the last stop |
| any running state | low energy or rain | goingHome |
| goingHome | at the start pose | done; the advice engine runs and the page switches to Advice |
| any running state | Pause, then Resume | paused, then the previous state |
| any state | E-stop, bumper, lost link, tilt, stuck, critical voltage, geofence | safeStop (latched) |
| safeStop | Release held 1.5 s and the check passes | idle; the partial report and its advice are saved |

&#91;embedded content: rover state machine in mission.ts: the per-stop loop and its three exits\]

The loop repeats once per stop; a stop without a probe goes straight back to Drive. The exits in the bottom band can interrupt any running state.

## Lab scenarios

Each scenario is a seed (default 42) plus a parameter patch, and its expected outcome comes from the physics. The Lab runs them headless, shows an outcome card for each, and the tests assert the outcomes below.

| # | Scenario | Patch | Expected outcome |
| --- | --- | --- | --- |
| 1 | Today's rover | plan A, packed lanes at θ = 0.24, blade probe between the axles | camera finishes 97 of 97; every probe aborts "Soil too hard" (needs 51 N, rover can push 10.6 N); one "No soil readings" card instead of water proposals; outcome "Complete, no soil data" |
| 2 | Twin-rod probe | scenario 1 with two 3 mm cone-tip rods and lanes at θ = 0.30 | probes succeed (8.3 N needed); about 68 min and 8.2 Wh |
| 3 | Plan C | shared lanes, pan servo, probe every second stop, twin rods, θ = 0.30 | about 25 min and 1.8 Wh |
| 4 | Low battery | scenario 2 starting at 20 % | pre-check warns (needs 40 %); if started anyway, heads home after about stop 31 (±3) and arrives with at least 10 %; outcome "Partial, low energy" |
| 5 | Rain | scenario 3 with 10 mm/h rain from minute 12 | rain sensor trips 10 s later; probing stops; rover goes home while lane slip visibly rises |
| 6 | Wet low spot | a 1.5 m dip of 5° in lane 2 at θ = 0.42 | climbing out needs 0.34 mg against 0.35 mg of traction; slip passes 0.8; one reverse attempt; safe stop "Stuck" |
| 7 | Loose tilled field | lanes loose at θ = 0.22, turn-to-look camera | pre-check flags "Can't pivot on this soil" (margin −0.01); forced, the wheels spin and the yaw rate collapses |
| 8 | Hose across a lane | a 2 cm hose across lane 3 | bumper fires; stop within 7 mm plus switch travel; back off 5 cm; safe stop "Bumper" |
| 9 | Far access point | access point 100 m from the block | RSSI falls below −90 dBm near the far end of a row; lost-link stop after 3 s |
| 10 | No heading control | positioning P0, motor spread 5 % | leaves the lane after about 1 m; bumper or geofence stop |
| 11 | Positioning compare | presets P0 to P4 on scenario 2 | chart of stop error against plant index; only P4 stays within ±0.02 m |
| 12 | Tall plants, low camera | 1.0 m plants on 15 cm beds; tilt 0° then 25° | plant coverage 17 % then 38 %; upper-canopy symptoms are missed accordingly |

Advice scenarios check what the farmer would be told:

| # | Scenario | Patch | Expected advice |
| --- | --- | --- | --- |
| 13 | Dry row | R3-P05 to R3-P10 at θ = 0.19, all other plants at 0.24 | one card, "Water 6 plants in row 3": 5.3 L each, 32 L total, Today; value line 32 L against 517 L |
| 14 | Rain coming | scenario 13 plus a 12 mm forecast at 70 % | same card at 3.9 L each, marked "rain expected"; with a 45 mm forecast: "Hold watering" |
| 15 | Yellow leaves | R2-P07 truth: nitrogen shortage; soil at 0.24 | Look-at card: likely low nitrogen; "too much water" ruled out because the soil is normal |
| 16 | Spreading blight | early blight on R2-P07 and 3 neighbours | "Spreading in row 2" ranked first: remove affected lower leaves, keep leaves dry, ask an agronomist; no chemical dose shown |
| 17 | Follow-up | scenario 13 with its card marked Done; soil back at 0.26 on the next round | card "Recovered: 6 plants in row 3" |
| 18 | Upper-leaf virus | R4-P12 truth: leaf curl virus, symptoms only on young upper leaves | the rover misses it (outside the camera's view); the Lab counts a miss, and the Hardware tab suggests a taller mast or more tilt |

## Reference numbers and tests

With the defaults above, the engine must reproduce every value below; each row becomes a Vitest case with its tolerance. The values come from `rover_sanity.py`, which is supplied with this prompt. Port it to `scripts/sanity.ts` so the engine's own modules print this table.

| Quantity | Expected | Tolerance |
| --- | --- | --- |
| Motor R, K, η\_g | 4.00 Ω, 4.265 mV·s/rad, 0.286 | ±1 % |
| Stall force per wheel | 2.41 N | ±1 % |
| Electronics power | 2.20 W | ±2 % |
| Cruise 0.15 m/s, packed: slip, motor current, duty | 1.3 %, 0.26 A, 20 % | ±5 % |
| Cruise, loose: slip, motor current, duty | 5.7 %, 0.41 A, 28 % | ±5 % |
| Cruise, mud: slip | 31 % | ±5 % |
| Energy per action (Battery section table) | every row | ±5 % |
| Pivot 90°, packed: side force, motor current, slip | 3.02 N, 1.00 A, 23 % | ±5 % |
| Turn margin: packed, loose, mud | +0.087, −0.012, −0.188 | ±0.005 |
| Maximum speed under the 6 V cap, loose | 0.66 m/s | ±3 % |
| Camera HFOV, VFOV | 54.0°, 41.8° | ±0.1° |
| Frame at 0.40 m; px/mm | 0.41 × 0.31 m; 1.96 | ±1 % |
| Coverage of a 1 m plant: flat, 15 cm bed, 25° tilt | 31 %, 17 %, 38 % | ±1 point |
| Blur at 1/60 s while moving | 4.9 px | ±2 % |
| Mast settle time | 0.88 s | ±2 % |
| Lift limit: between axles, front | 10.6 N, 4.3 N | ±2 % |
| Blade force at θ = 0.25: bed, lane | 12.4 N, 47.4 N | ±3 % |
| Lowest θ for the blade in bed, between axles | 0.279 | ±0.005 |
| Lowest θ for twin rods in lane | 0.261 | ±0.005 |
| Probe stroke speed; full cycle | 4.5 mm/s; 29.4 s | ±5 % |
| Screw thrust at stall | 79 N | ±2 % |
| SoC at 11.10 V: rested, at 1.5 A | 37.5 %, 64 % | ±1 point |
| Pack energy, 2.5 Ah 3S | 28.1 Wh | ±1 % |
| Battery sag during a pivot | 0.53 V | ±5 % |
| Plans A, B, C: time | 68.5, 61.2, 25.0 min | ±3 % |
| Plans A, B, C: energy | 8.16, 4.41, 1.77 Wh | ±5 % |
| Lowest start SoC: plan A, plan C | 39.9 %, 17.1 % | ±2 points |
| Low battery from 20 % (plan A): stops before heading home; SoC at home | 31; 10.5 % | ±3 stops; ±1 point |
| Open-loop drift: yaw rate; distance to leave the lane | 1.58°/s; 1.04 m | ±5 % |
| Along-row error at row end: time-based, encoders packed, encoders loose | 0.95, 0.12, 0.54 m | ±5 % |
| Wi-Fi breakpoint; RSSI at 50 m | 13.0 m; −77.6 dBm | ±0.5 dB |
| TAW, RAW, trigger θ, refill at θ = 0.19 | 60 mm, 24 mm, 0.21, 5.33 L | ±1 % |
| Crop water use per plant | 2.59 L/day | ±1 % |
| Stopping distance: onboard trigger, Wi-Fi E-stop | 7.3 mm, 40 mm | ±10 % |

Advice engine values, with the defaults from the Agronomy section:

| Quantity | Expected | Tolerance |
| --- | --- | --- |
| Refill point; "water now" threshold; "too wet" threshold | θ = 0.21; 0.1425; 0.30 | exact |
| Volume per plant at θ = 0.19; at θ = 0.14 | 5.33 L; 8.67 L | ±1 % |
| Six plants at θ = 0.19: total; drip time at 2 L/h | 32.0 L; 2 h 40 min | ±1 % |
| The same dose on all 97 plants | 517 L | ±1 % |
| Rain adjustment for 12 mm at 70 %; rain that cancels watering | 3.89 L; 44.4 mm | ±1 % |
| Card order and limit | Now, Spreading, Water, Too wet, Look at, Re-check, Check by hand, No soil data; at most 5 | exact |

Tests to write:

- **Unit:** one test per row in both tables.
- **Energy balance:** over a full round, battery energy out equals motor copper loss + wheel work + gearbox loss + driver loss + electronics, within 1 %.
- **Determinism:** the same seed gives the same event-log hash and the same advice; another seed changes only the noise.
- **Scenarios:** Lab scenarios 1–18 assert their expected outcomes.
- **Advice snapshots:** the cards for scenarios 13–18 are snapshot-tested, so changing a rule changes a snapshot on purpose.
- **UI smoke (Playwright):** the Rover page loads in under 2 s and opens on Advice when no round is running; no task longer than 50 ms while playing at 60×; the E-stop is reachable by keyboard from every tab.

## Deliverables, phases and acceptance

Ship in seven phases. Each phase ends with a short demo and green tests, and Phase 0 waits for approval. The Advice view comes before the 3D twin, because it is the part the farmer actually uses.

1. **Phase 0, recon (no code):** read the repo; list the files you will change; propose the component tree and store shape; name any conflicts with this prompt. Stop and wait.
2. **Phase 1, simulation core:** profile, battery, motor, driver, soil, vehicle, planner and safety, with the reference tests passing. `scripts/sanity.ts` prints the reference table.
3. **Phase 2, advice engine and Advice view:** `advice.ts` with its rules and diagnosis hints; advice cards, field map, value line and basic plant records, with scenarios 13–18 passing.
4. **Phase 3, Round view:** top bar, E-stop, gauges, stepper, timeline and toasts, fed by the worker through `TelemetrySource`; the page switches to Advice when a round ends.
5. **Phase 4, 3D twin:** procedural rover, field and plants, plus the overlays: frustum, slip particles, ruts, uncertainty ellipse, path ribbon and the rover's-eye view.
6. **Phase 5, Plants, Hardware and Lab tabs:** full plant records, field walk, round report export, CAD inspector, capability cards, probe envelope chart, scenario runner and comparisons.
7. **Phase 6, polish:** small screens, accessibility pass, performance budget, and the `liveSource` WebSocket stub.

### Acceptance

- [ ] After a round, the page opens on Advice with at most 5 cards, each saying what to do, where, how much, by when and why.
- [ ] Every card opens its evidence: photo crop, readings and the rule that fired.
- [ ] A card marked Done is followed by Recovered, Still dry or Spreading on the next round.
- [ ] No chemical product or dose appears unless the user entered it with a label rate.
- [ ] No persistent label is longer than three words; longer sentences appear only in Why panels, tooltips and the help drawer.
- [ ] Each metric appears once per view.
- [ ] Every reference test and advice snapshot passes.
- [ ] A 70-minute round plays at 60× in 75 s or less, and runs headless in under 3 s.
- [ ] The same seed gives the same event-log hash and the same advice.
- [ ] Low energy, rain, stuck, bumper, lost link, tilt and probe lift can each be triggered from the Lab and are visible in 3D.
- [ ] The E-stop is visible on every tab, works by click and keyboard, and halts motion within one physics step.
- [ ] The Round view holds 60 fps at 1440p on a 2020-class laptop with integrated graphics.
- [ ] All text meets WCAG AA contrast, and colour is never the only signal.
- [ ] No other page has changed.

### Do not

- Fake an outcome with a timer, a scripted banner or a canned animation.
- Turn the page into a wall of sensor numbers; numbers serve the advice.
- Use a general rigid-body engine for wheel–soil contact; it cannot do the slip, lift and sinkage this prompt defines. Use one only for collisions, if at all.
- Show voltage as a battery percentage.
- Put explanatory sentences in the HUD.
- Add more than two new dependencies without asking.

## Sources

Everything not listed here is marked *estimate* in the profile and should be measured.

- [Adafruit 3777, TT gearbox motor](https://www.adafruit.com/products/3777): bench no-load current, rpm and stall current at 3, 4.5 and 6 V; rated stall torque; 1:48 ratio.
- [LM18298 datasheet](https://www.logosfoundation.org/instrum_gwr/korn/LM18298.pdf): typical and maximum saturation voltages at 1 A and 2 A; pin-compatible with the L298N.
- [ST L298 datasheet](https://www.ece.nus.edu.sg/ee3032/html/Common/L298datasheet.pdf): total drop limits, quiescent currents, 2 A DC per channel.
- [DFRobot ESP32-CAM wiki](https://wiki.dfrobot.com/dfr0602/): 180 mA at 5 V with flash off; transmit power; receive sensitivity.
- [M5Stack ESP32-CAM](https://docs.m5stack.com/en/unit/esp32cam?id=video): OV2640 with a 65° field of view.
- [Zbotic, battery state of charge](https://zbotic.in/how-to-read-battery-state-of-charge-voltage-vs-actual-capacity/): rested OCV table for 18650 Li-ion cells.
- [Mandow et al., IROS 2007](https://researchr.org/publication/MandowMMBGG07): experimental (ICR-based) kinematics for wheeled skid-steer robots.
- [MPU-6050, TDK listing](https://www.datasheets.com/tdk/mpu-6050) and [datasheet summary](https://www.ultralibrarian.com/?p=28422): gyro rate noise 0.005 °/s/√Hz; initial zero-rate offset ±20 °/s.
- [DFRobot SEN0193 capacitive soil sensor](https://www.dfrobot.com/product-1385.html): 98 × 23 mm board, 1.2–2.5 V output.
- [USDA-ARS, cone index correction](https://eprints.nwisrl.ars.usda.gov/id/eprint/688): penetration resistance varies with soil water content.
- [FAO-56, chapter 6](https://www.fao.org/4/x0490e/x0490e0b.htm): tomato crop coefficients. [FAO-56, chapter 8](https://www.fao.org/4/x0490e/x0490e0e.htm): TAW, RAW, tomato rooting depth and depletion fraction.
- [Minnesota Pollution Control Agency, soil water storage](https://stormwater.pca.state.mn.us/index.php/Soil_water_storage_properties): field capacity and wilting point for loam.
- [Foliage path loss at 28 GHz (arXiv 1902.06798)](https://arxiv.org/pdf/1902.06798): Weissberger's modified exponential decay model.

* [Oklahoma State, early blight of tomato](https://extension.okstate.edu/programs/digital-diagnostics/plant-diseases/early-blight-of-tomato) and [Septoria leaf spot](https://extension.okstate.edu/programs/digital-diagnostics/plant-diseases/septoria-leaf-spot): spot size, rings and where symptoms start. The other diagnosis hints link their extension guides in place.
