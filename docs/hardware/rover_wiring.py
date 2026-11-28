"""Draw the rover's motor wiring: ESP32 DevKit (30 pins) -> 2 x L298N -> 4 TT motors.

    python docs/hardware/rover_wiring.py

Writes docs/hardware/rover-wiring.svg and apps/web/src/assets/rover-wiring.svg (shown on Rover > Test).
The pin map here must match `channels[]` in edge/rover-motor-controller/rover_motor_controller.ino.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = [ROOT / "docs/hardware/rover-wiring.svg", ROOT / "apps/web/src/assets/rover-wiring.svg"]

W, H = 1600, 1110
FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif"
INK, MUTED, LINE = "#1f2a24", "#66736b", "#dfe3dc"
EN, FWD, BACK = "#d99a00", "#2e9e5b", "#2f6fd6"           # speed (PWM), forward, backward
MOTOR, V12, V5, GND = "#8a8f8b", "#d63a2f", "#c2418f", "#1b1b1b"
RED, RED_EDGE, ESP, SCREW, YELLOW, TYRE = "#c43c32", "#9e2b23", "#22262a", "#2f6db5", "#f2c230", "#2a2a2a"

# ESP32 DevKit V1, 30 pins, top view, antenna up: header A down the left edge, header B down the right.
HEADER_A = ["EN", "VP", "VN", "D34", "D35", "D32", "D33", "D25", "D26", "D27", "D14", "D12", "D13", "GND", "VIN"]
HEADER_B = ["D23", "D22", "TX0", "RX0", "D21", "D19", "D18", "D5", "TX2", "RX2", "D4", "D2", "D15", "GND", "3V3"]
PIN0, PITCH = 242, 28
PAD_A, PAD_B = 696, 904


def pin_y(k: int) -> int:                 # k counts from 0
    return PIN0 + k * PITCH


# One ESP32 pin for every L298N pin. (ESP32 pin, L298N pin, colour) in header order: no wire crosses.
LEFT = [("D32", "ENA", EN), ("D33", "IN1", FWD), ("D25", "IN2", BACK), ("D26", "IN3", FWD), ("D27", "IN4", BACK), ("D13", "ENB", EN)]
RIGHT = [("D23", "ENA", EN), ("D22", "IN1", FWD), ("D21", "IN2", BACK), ("D19", "IN3", FWD), ("D18", "IN4", BACK), ("TX2", "ENB", EN)]
LEFT_Y0, RIGHT_Y0 = pin_y(5), pin_y(3)    # where each board's six header pins start, 28 px apart
USED = {p: c for p, _, c in LEFT + RIGHT}

out: list[str] = []


def add(s: str) -> None:
    out.append(s)


def text(x, y, s, size=13, weight=400, fill=INK, anchor="start", extra=""):
    add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{s}</text>')


def rect(x, y, w, h, fill, rx=0, stroke=None, sw=1, extra=""):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st} {extra}/>')


def wire(d, color, width=4.5, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{da}/>')


def tag(cx, y, label, fill, w=50, outline=False):
    if outline:
        rect(cx - w / 2, y, w, 20, "#ffffff", rx=10, stroke=MUTED, sw=1.2, extra='stroke-dasharray="4 3"')
        text(cx, y + 14, label, 10.5, 600, MUTED, "middle")
    else:
        rect(cx - w / 2, y, w, 20, fill, rx=10)
        text(cx, y + 14, label, 11.5, 700, "#ffffff", "middle")


def screw(cx, cy):
    add(f'<circle cx="{cx}" cy="{cy}" r="10" fill="#c9d2dc" stroke="#6f7d8c" stroke-width="1.5"/>')
    add(f'<line x1="{cx - 6}" y1="{cy}" x2="{cx + 6}" y2="{cy}" stroke="#6f7d8c" stroke-width="2"/>')


def terminal(x, y, labels, label_y):
    rect(x, y, 36 * len(labels), 34, SCREW, rx=4)
    for i, lab in enumerate(labels):
        cx = x + 18 + 36 * i
        screw(cx, y + 17)
        text(cx, label_y, lab, 10.5, 600, "#ffffff", "middle")


def motor(side: str, top: int, name: str):
    """A TT motor and its wheel. side 'L' = wheel on the far left, 'R' = far right. Returns the two lead points."""
    cy = top + 54
    if side == "L":
        tx, gx, cx_, can_end = 56, 122, 190, 222
    else:
        tx, gx, cx_, can_end = 1478, 1410, 1378, 1378
    rect(tx, top, 66, 108, TYRE, rx=14)
    for i in range(8):
        add(f'<line x1="{tx + 6}" y1="{top + 10 + i * 12.5}" x2="{tx + 60}" y2="{top + 10 + i * 12.5}" stroke="#454545" stroke-width="3"/>')
    rect(tx + 24, cy - 14, 18, 28, YELLOW, rx=3)
    rect(gx, cy - 24, 68, 48, YELLOW, rx=6, stroke="#c79a12", sw=1.5)
    rect(cx_, cy - 18, 32, 36, "#d5d9dd", rx=9, stroke="#a7adb3", sw=1.5)
    lx = 139 if side == "L" else 1461
    ly = top - 10 if top < 400 else top + 126
    text(lx, ly, name, 12, 800, INK, "middle", 'letter-spacing="1"')
    return (can_end, cy - 14), (can_end, cy + 2)


def l298n(x0: int, side: str):
    """One L298N, x0 = left edge, 260 x 370. side 'L' has its header on the right edge, 'R' on the left."""
    y0 = 250
    rect(x0, y0, 260, 370, RED, rx=10, stroke=RED_EDGE, sw=2)
    mid = x0 + 150 if side == "L" else x0 + 110
    text(mid, y0 + 40, f"L298N · {'LEFT' if side == 'L' else 'RIGHT'}", 16, 800, "#ffffff", "middle")
    text(mid, y0 + 59, f"{'left' if side == 'L' else 'right'} wheels", 11.5, 400, "#ffe2de", "middle")
    hs = x0 + 55 if side == "L" else x0 + 115
    rect(hs, 335, 90, 130, "#1d1f22", rx=4)
    for i in range(8):
        add(f'<line x1="{hs + 10 + i * 10}" y1="341" x2="{hs + 10 + i * 10}" y2="459" stroke="#3b3f44" stroke-width="3"/>')
    out_x = x0 + 12 if side == "L" else x0 + 176
    terminal(out_x, 262, ["OUT1", "OUT2"], 312)
    terminal(out_x, 574, ["OUT3", "OUT4"], 566)
    pw = x0 + 98 if side == "L" else x0 + 52
    terminal(pw, 574, ["12V", "GND", "5V"], 566)
    jx = x0 + 220 if side == "L" else x0 + 20
    rect(jx, 584, 20, 14, "#111111", rx=2)
    text(jx + 10, 579, "5V-EN", 9, 700, "#ffffff", "middle")
    text(jx + 10, 611, "keep", 9, 400, "#ffe2de", "middle")
    # the six logic pins, with the pin each wire comes from
    pins = LEFT if side == "L" else RIGHT
    py0 = LEFT_Y0 if side == "L" else RIGHT_Y0
    hx = x0 + 248 if side == "L" else x0 + 12
    rect(hx - 10, py0 - 14, 20, 28 * 5 + 28, "#2b2b2b", rx=3)
    for i, (_, lab, color) in enumerate(pins):
        y = py0 + i * 28
        if side == "L":
            text(hx - 20, y + 4.5, lab, 12.5, 700, "#ffffff", "end")
        else:
            text(hx + 20, y + 4.5, lab, 12.5, 700, "#ffffff", "start")
    note_y = py0 + 5 * 28 + 18
    if side == "L":
        text(x0 + 256, note_y, "ENA / ENB: jumpers off", 9.5, 600, "#ffe2de", "end")
    else:
        text(x0 + 4, note_y, "ENA / ENB: jumpers off", 9.5, 600, "#ffe2de", "start")
    return hx, py0


# ------------------------------------------------------------------ page
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">')
add('<title>AgriRover motor wiring: ESP32 DevKit to two L298N boards and four TT motors</title>')
rect(0, 0, W, H, "#ffffff")
text(40, 52, "AgriRover · motor wiring", 30, 800)
text(40, 80, "Top view, front up · ESP32 DevKit V1 (30 pins) · 2 × L298N · 4 TT motors · firmware rover-mc-2.1.0", 16, 400, MUTED)
for x, y, color, lab in [(1060, 46, EN, "Speed · ENA / ENB"), (1230, 46, FWD, "Forward · IN1 / IN3"), (1410, 46, BACK, "Back · IN2 / IN4"),
                         (1060, 74, MOTOR, "Motor wires"), (1200, 74, V12, "+12 V"), (1290, 74, V5, "5 V"), (1370, 74, GND, "GND")]:
    add(f'<line x1="{x}" y1="{y}" x2="{x + 26}" y2="{y}" stroke="{color}" stroke-width="5" stroke-linecap="round"/>')
    text(x + 34, y + 4.5, lab, 13, 500, INK)
text(800, 136, "▲ FRONT", 12, 700, MUTED, "middle", 'letter-spacing="2"')

# motors and their leads (drawn first: the boards' terminals sit on top)
fl = motor("L", 196, "FRONT-LEFT")
rl = motor("L", 616, "REAR-LEFT")
fr = motor("R", 196, "FRONT-RIGHT")
rr = motor("R", 616, "REAR-RIGHT")

l298n(300, "L")
l298n(1040, "R")

# motor leads into the OUT screws; the far screw's lead runs outside the near one's, so they never cross
for (a, b), near, far, down in [(fl, 330, 366, False), (rl, 330, 366, True), (fr, 1270, 1234, False), (rr, 1270, 1234, True)]:
    if not down:   # into the top terminal from above
        wire(f"M{a[0]},{a[1]} C{(a[0] + far) / 2},{a[1] - 8} {far},{a[1] - 16} {far},279", MOTOR, 3.5)
        wire(f"M{b[0]},{b[1]} C{(b[0] + near) / 2},{b[1]} {near},{b[1] - 10} {near},279", MOTOR, 3.5)
    else:          # into the bottom terminal from below
        wire(f"M{b[0]},{b[1]} C{(b[0] + far) / 2},{b[1] + 8} {far},{b[1] + 13} {far},591", MOTOR, 3.5)
        wire(f"M{a[0]},{a[1]} C{(a[0] + near) / 2},{a[1]} {near},{a[1] - 23} {near},591", MOTOR, 3.5)
for x in (330, 366, 1234, 1270):           # screw heads over the wire ends
    for y in (279, 591):
        screw(x, y)

# ESP32 board
rect(680, 150, 240, 530, ESP, rx=10)
rect(740, 158, 120, 34, "#3a3f45", rx=3)
add('<polyline points="752,184 752,166 768,166 768,184 784,184 784,166 800,166 800,184 816,184 816,166 832,166 832,184 848,184" '
    'fill="none" stroke="#c9a227" stroke-width="2.5"/>')
rect(752, 200, 96, 100, "#b9bec4", rx=4, stroke="#8e949a", sw=1.5)
text(800, 252, "ESP32", 14, 800, "#4a5058", "middle")
text(800, 268, "WROOM-32", 9, 600, "#4a5058", "middle")
text(800, 405, "ESP32 DevKit", 13, 800, "#ffffff", "middle")
text(800, 423, "V1 · 30 pins", 11, 400, "#aab1b8", "middle")
rect(772, 670, 56, 20, "#9aa0a6", rx=5)

# signal wires: one ESP32 pin to one L298N pin, as S-curves (same x control points, so none cross)
for i, (pin, _, color) in enumerate(LEFT):
    ys, yt = pin_y(HEADER_A.index(pin)), LEFT_Y0 + i * 28
    wire(f"M{PAD_A},{ys} C622,{ys} 622,{yt} 548,{yt}", color)
for i, (pin, _, color) in enumerate(RIGHT):
    ys, yt = pin_y(HEADER_B.index(pin)), RIGHT_Y0 + i * 28
    wire(f"M{PAD_B},{ys} C978,{ys} 978,{yt} 1052,{yt}", color)

# power and optional pins on the ESP32
gy, vy = pin_y(HEADER_A.index("GND")), pin_y(HEADER_A.index("VIN"))
wire(f"M{PAD_A},{gy} L640,{gy}", GND)
tag(615, gy - 10, "GND", GND)
wire(f"M{PAD_A},{vy} L640,{vy}", V5)
tag(615, vy - 10, "5 V", V5)
by = pin_y(HEADER_A.index("D34"))
wire(f"M{PAD_A},{by} L652,{by}", MUTED, 2, "5 4")
tag(611, by - 10, "batt. sense", None, 82, outline=True)
dy = pin_y(HEADER_B.index("D4"))
wire(f"M{PAD_B},{dy} L948,{dy}", MUTED, 2, "5 4")
tag(990, dy - 10, "bumper", None, 80, outline=True)

# ESP32 pads and pin names
for header, pad, anchor, lx in [(HEADER_A, PAD_A, "start", 710), (HEADER_B, PAD_B, "end", 890)]:
    for k, name in enumerate(header):
        y = pin_y(k)
        color = USED.get(name) or ({"GND": GND, "VIN": V5}.get(name) if header is HEADER_A else None)
        if color:
            add(f'<circle cx="{pad}" cy="{y}" r="7" fill="{color}" stroke="#ffffff" stroke-width="2"/>')
            text(lx, y + 4.5, name, 12.5, 800, "#ffffff", anchor)
        else:
            add(f'<circle cx="{pad}" cy="{y}" r="6" fill="#5b6168" stroke="#3a3f45" stroke-width="1.5"/>')
            text(lx, y + 4.5, name, 12, 500, "#8d949b", anchor)

# L298N header pads on top of the wire ends
for pins, x, y0 in [(LEFT, 548, LEFT_Y0), (RIGHT, 1052, RIGHT_Y0)]:
    for i, (_, _, color) in enumerate(pins):
        add(f'<circle cx="{x}" cy="{y0 + i * 28}" r="7" fill="{color}" stroke="#ffffff" stroke-width="2"/>')

# L298N power: +12 V and GND tags under each board's terminal (the 5V terminal stays empty)
for x12, xg in [(416, 452), (1110, 1146)]:
    wire(f"M{x12},601 L{x12},640", V12)
    tag(x12, 640, "+12 V", V12)
    wire(f"M{xg},601 L{xg},668", GND)
    tag(xg, 668, "GND", GND)
for x in (416, 452, 488, 1110, 1146, 1182):
    screw(x, 591)

# camera: power only, it talks over Wi-Fi
rect(700, 712, 200, 60, "#f4f6f3", rx=8, stroke=LINE, sw=1.5)
rect(714, 728, 34, 28, "#ffffff", rx=5, stroke="#9aa39c", sw=1.5)
add('<circle cx="731" cy="742" r="8" fill="#1d1f22"/>')
text(822, 738, "ESP32-CAM", 13, 800, INK, "middle")
text(822, 756, "on the mast · Wi-Fi only", 11, 400, MUTED, "middle")
wire("M700,726 L686,726", V5)
tag(661, 716, "5 V", V5)
wire("M700,756 L686,756", GND)
tag(661, 746, "GND", GND)

# ------------------------------------------------------------------ cards
def card(x, w, title):
    rect(x, 805, w, 268, "#f6f7f4", rx=12, stroke="#e1e5df", sw=1.2)
    text(x + 20, 836, title, 16, 800)


card(40, 470, "Power")
rect(60, 852, 150, 38, "#2f6fb5", rx=6)
text(135, 868, "Battery 3S", 12, 800, "#ffffff", "middle")
text(135, 883, "11.1–12.6 V", 10, 400, "#dce8f7", "middle")
text(220, 866, "+", 14, 800, V12)
wire("M228,871 L262,871", V12)
rect(262, 858, 60, 26, "#ffffff", rx=5, stroke=INK, sw=1.2)
text(292, 875, "switch", 11, 600, INK, "middle")
wire("M322,871 L350,871", V12)
rect(350, 858, 56, 26, "#ffffff", rx=5, stroke=INK, sw=1.2)
text(378, 875, "fuse 5 A", 11, 600, INK, "middle")
wire("M406,871 L436,871", V12)
tag(462, 861, "+12 V", V12)
text(52, 908, "−", 15, 800, GND)
wire("M100,890 L100,916 L436,916", GND)
tag(462, 906, "GND", GND)
tag(160, 948, "+12 V", V12)
tag(160, 974, "GND", GND)
wire("M185,958 L262,958", V12, 3)
wire("M185,984 L262,984", GND, 3)
rect(262, 946, 144, 48, "#ffffff", rx=6, stroke=INK, sw=1.2)
text(334, 966, "Buck 12 V → 5 V", 12, 800, INK, "middle")
text(334, 983, "3 A, set to 5.0 V", 10, 400, MUTED, "middle")
wire("M406,970 L436,970", V5)
tag(462, 960, "5 V", V5)
for i, s in enumerate(["Join every GND tag: battery −, both L298N, buck, ESP32, camera.",
                       "5 V goes to ESP32 VIN and the camera. Never 12 V on the ESP32.",
                       "Leave the L298N 5V terminals empty."]):
    text(60, 1020 + i * 20, s, 12, 400, INK)

card(530, 540, "Which pin drives which wheel")
cols = [550, 668, 830, 914, 1000]
for x, h in zip(cols, ["WHEEL", "L298N TERMINAL", "SPEED", "FORWARD", "BACK"]):
    text(x, 866, h, 10.5, 800, MUTED, extra='letter-spacing="1"')
rows = [("Front-left", "left · OUT1–OUT2", LEFT[0][0], LEFT[1][0], LEFT[2][0]),
        ("Rear-left", "left · OUT3–OUT4", LEFT[5][0], LEFT[3][0], LEFT[4][0]),
        ("Front-right", "right · OUT1–OUT2", RIGHT[0][0], RIGHT[1][0], RIGHT[2][0]),
        ("Rear-right", "right · OUT3–OUT4", RIGHT[5][0], RIGHT[3][0], RIGHT[4][0])]
for r, (wheel, term, en, fw, bk) in enumerate(rows):
    y = 896 + r * 32
    add(f'<line x1="550" y1="{y - 20}" x2="1050" y2="{y - 20}" stroke="#e1e5df"/>')
    text(cols[0], y, wheel, 13, 700)
    text(cols[1], y, term, 12.5, 400, MUTED)
    for x, pin, color, l298 in [(cols[2], en, EN, "ENA" if r % 2 == 0 else "ENB"), (cols[3], fw, FWD, "IN1" if r % 2 == 0 else "IN3"),
                                (cols[4], bk, BACK, "IN2" if r % 2 == 0 else "IN4")]:
        rect(x, y - 15, 44, 21, color, rx=5)
        text(x + 22, y, pin, 12, 800, "#ffffff", "middle")
        text(x + 50, y, l298, 10.5, 600, MUTED)
for i, s in enumerate(["Each ESP32 pin goes to the L298N pin of the same colour, one wire each.",
                       "TX2 is GPIO 17. D-numbers are the GPIO numbers (D32 = GPIO 32)."]):
    text(550, 1036 + i * 20, s, 12, 400, MUTED)

card(1090, 470, "Before the first test")
steps = ["Take the jumpers off ENA and ENB on both L298N (4).",
         "Keep the 5V-EN jumper. Join every GND.",
         "Flash rover-mc-2.1.0: it drives these pins.",
         "Release E-stop. Rover › Test: tick the box, press Forward.",
         "A wheel turns backward? Swap its two motor wires.",
         "Nothing moves? Battery on, GND joined, pins as above."]
for i, s in enumerate(steps):
    y = 872 + i * 32
    add(f'<circle cx="1121" cy="{y - 4}" r="11" fill="{INK}"/>')
    text(1121, y, str(i + 1), 11.5, 800, "#ffffff", "middle")
    text(1142, y, s, 12.5, 400, INK)

text(40, 1096, "Terminal positions are simplified: match the labels printed on your boards. "
     "Dashed: optional (battery sense on D34 through 100 kΩ / 22 kΩ, bumper switch from D4 to GND). "
     "Source: docs/hardware/rover_wiring.py", 11, 400, MUTED)
add("</svg>")

svg = "\n".join(out) + "\n"
for path in OUT:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({len(svg) // 1024} kB)")
