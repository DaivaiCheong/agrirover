"""Mission outputs: report.json, a field map (SVG, opens in any browser and on
GitHub) and, when Pillow is installed, a mosaic of what the camera saw."""
from __future__ import annotations

import json
from html import escape
from pathlib import Path

from rover.mission import MissionReport

STYLE = {
    "bare": ("#E8E2D6", "Bare soil"),
    "ok": ("#5E9E4F", "Plant · moisture OK"),
    "water": ("#2F78B7", "Plant · needs water"),
    "unscanned": ("#FFFFFF", "Not scanned"),
}
FLAG = "#E3A21A"
INK = "#24292F"


def _state(result) -> str:
    if result is None:
        return "unscanned"
    if not result.obs.plant:
        return "bare"
    return "water" if result.obs.needs_water else "ok"


def field_map_svg(report: MissionReport, px: int = 56) -> str:
    rows, cols = report.rows, report.cols
    width = max(cols * px + 48, 560)
    head, legend = 72, 72
    height = head + rows * px + legend + 16
    x0 = (width - cols * px) / 2
    by_cell = {(r.row, r.col): r for r in report.results}

    def corner(row: int, col: int) -> tuple[float, float]:
        return x0 + col * px, head + (rows - 1 - row) * px      # row 0 at the bottom

    def centre(row: int, col: int) -> tuple[float, float]:
        x, y = corner(row, col)
        return x + px / 2, y + px / 2

    status = (f" · {report.status.upper()}: {report.abort_reason}"
              if report.status != "completed" else "")
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" font-family="Segoe UI, Helvetica, Arial, sans-serif">',
        f'<rect width="{width}" height="{height}" fill="#FAFAF7"/>',
        f'<text x="24" y="30" font-size="18" font-weight="700" fill="{INK}">'
        f'AgriRover survey · {escape(report.zone_id)} · mission {escape(report.mission_id[:12])}</text>',
        f'<text x="24" y="52" font-size="13" fill="#57606A">'
        f'{report.cells_scanned}/{rows * cols} cells · {report.plants_detected} plants · '
        f'{report.plants_needing_water} need water · {report.cells_flagged} flagged for disease check · '
        f'{report.distance_m:.1f} m{escape(status)}</text>',
    ]

    for row in range(rows):
        for col in range(cols):
            result = by_cell.get((row, col))
            fill = STYLE[_state(result)][0]
            x, y = corner(row, col)
            dash = ' stroke-dasharray="4 3"' if result is None else ""
            out.append(f'<rect x="{x + 1}" y="{y + 1}" width="{px - 2}" height="{px - 2}" '
                       f'fill="{fill}" stroke="#C9C3B6"{dash}/>')
            if result is not None and result.obs.flagged:
                out.append(f'<rect x="{x + 4}" y="{y + 4}" width="{px - 8}" height="{px - 8}" '
                           f'fill="none" stroke="{FLAG}" stroke-width="3"/>')
            if result is not None and result.obs.needs_water:
                out.append(f'<text x="{x + px / 2}" y="{y + px - 8}" font-size="11" '
                           f'text-anchor="middle" fill="#FFFFFF">{result.obs.suggested_ml} ml</text>')

    scanned = [centre(r, c) for r, c in report.path[:max(report.cells_scanned, 1)]]
    if len(scanned) > 1:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in scanned)
        out.append(f'<polyline points="{pts}" fill="none" stroke="{INK}" stroke-opacity="0.55" '
                   f'stroke-width="2" stroke-linejoin="round"/>')
    if scanned:
        sx, sy = scanned[0]
        ex, ey = scanned[-1]
        out.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="5" fill="{INK}"/>')
        out.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="5" fill="#FFFFFF" stroke="{INK}" stroke-width="2"/>')

    ly = head + rows * px + 26
    items = [(STYLE["ok"][0], "none", STYLE["ok"][1]), (STYLE["water"][0], "none", STYLE["water"][1]),
             (STYLE["bare"][0], "none", STYLE["bare"][1]), ("none", FLAG, "Yellowing · check for disease")]
    for i, (fill, stroke, label) in enumerate(items):
        lx = 24 + (i % 2) * (width - 48) / 2
        y = ly + (i // 2) * 22
        edge = f'stroke="{stroke}" stroke-width="3"' if stroke != "none" else 'stroke="#C9C3B6"'
        out.append(f'<rect x="{lx}" y="{y - 12}" width="16" height="16" fill="{fill}" {edge}/>')
        out.append(f'<text x="{lx + 24}" y="{y + 1}" font-size="12" fill="{INK}">{label}</text>')
    out.append(f'<text x="24" y="{ly + 48}" font-size="11" fill="#57606A">'
               f'● start  ○ last cell scanned · row 0 at the bottom, rover starts heading east</text>')
    out.append("</svg>")
    return "\n".join(out)


def frames_mosaic(frames: dict, report: MissionReport, path: Path, tile: int = 96) -> bool:
    """Camera frames laid out like the field map. Returns False if Pillow is missing."""
    try:
        from PIL import Image
    except ImportError:
        return False
    gap = 2
    canvas = Image.new("RGB", (report.cols * (tile + gap) + gap, report.rows * (tile + gap) + gap),
                       (250, 250, 247))
    for (row, col), img in frames.items():
        im = Image.fromarray(img).resize((tile, tile))
        canvas.paste(im, (gap + col * (tile + gap), gap + (report.rows - 1 - row) * (tile + gap)))
    canvas.save(path)
    return True


def save_report(report: MissionReport, out_dir: str | Path, frames: dict | None = None) -> dict[str, Path]:
    folder = Path(out_dir) / report.mission_id          # mission_id is validated: safe as a name
    folder.mkdir(parents=True, exist_ok=True)
    paths = {"json": folder / "report.json", "svg": folder / "field-map.svg"}
    paths["json"].write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    paths["svg"].write_text(field_map_svg(report), encoding="utf-8")
    if frames:
        png = folder / "camera-frames.png"
        if frames_mosaic(frames, report, png):
            paths["frames"] = png
    return paths
