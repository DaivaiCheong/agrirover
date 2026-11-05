"""AgriRover command line.

    python -m rover sim                  simulated survey, no hardware, no broker
    python -m rover sim --battery 11.3   ... and watch the low-battery guard stop it
    python -m rover run                  on the rover: MQTT + motor controller + Pi camera
    python -m rover run --sim-hardware   full-stack demo: real broker, simulated rover
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time

from rover.camera import SimCamera, SimField
from rover.config import RoverConfig
from rover.drive import Pose, SimDrive
from rover.mission import MissionReport, MissionRunner, MissionSpec, SimOptions, planned_stats
from rover.planner import Cell
from rover.probe import SimProbe
from rover.report import save_report
from rover.safety import Guards, SafetyStop


def sim_runner(cfg: RoverConfig, spec: MissionSpec, seed: int, guards: Guards,
               battery_v: float = 12.6, on_frame=None,
               speedup: float = 0.0, simulated: bool = True) -> tuple[MissionRunner, SimField]:
    """speedup 0 = instant; 1 = real time; 10 = ten times faster than the real rover."""
    sim = spec.sim or SimOptions()
    field = SimField(spec.rows, spec.cols, seed=seed, base=sim.base,
                     moisture_spread=12.0 if sim.moisture_spread is None else sim.moisture_spread)
    row_m = spec.row_spacing
    sleep = (lambda s: time.sleep(s / speedup)) if speedup > 0 else None
    drive = SimDrive(cfg.drive, Pose(spec.cell_m / 2, row_m / 2, 0.0),
                     fence=(spec.cols * spec.cell_m, spec.rows * row_m),
                     battery_v=battery_v, sleep=sleep)
    return MissionRunner(cfg, drive, SimCamera(field), guards, on_frame=on_frame, simulated=simulated, probe=SimProbe(field)), field


def live_sim_runner(cfg: RoverConfig, spec: MissionSpec, guards: Guards, seed: int = 7, speedup: float = 40.0) -> MissionRunner:
    """The simulated rover on the real broker. Everything but the wheels and the camera is the real software,
    and a scripted event ends the survey through the same path a real one would."""
    sim = spec.sim or SimOptions()
    pace = speedup if sim.speedup is None else sim.speedup
    photographed = [0]

    def on_frame(_cell, _img) -> None:
        if pace > 0:
            time.sleep((cfg.capture_s + cfg.probe_s) / pace)   # photographing and probing take time on the real rover
        photographed[0] += 1
        if sim.rain_at_cell is not None and photographed[0] >= sim.rain_at_cell:
            raise SafetyStop("rain")

    return sim_runner(cfg, spec, seed if sim.seed is None else sim.seed, guards,
                      battery_v=12.6 if sim.battery_v is None else sim.battery_v,
                      on_frame=on_frame, speedup=pace)[0]


def agreement(report: MissionReport, field: SimField) -> dict[str, float]:
    """How often the vision agrees with the simulator's ground truth."""
    if not report.results:
        return {}
    n = len(report.results)
    truths = [field.truth(Cell(r.row, r.col)) for r in report.results]
    return {
        "plant": sum(r.obs.plant == t.plant for r, t in zip(report.results, truths)) / n,
        "yellowing": sum(r.obs.flagged == (t.chlorosis > 0) for r, t in zip(report.results, truths)) / n,
    }


def cmd_sim(args: argparse.Namespace) -> int:
    cfg = RoverConfig(report_dir=args.out)
    spec = MissionSpec(args.mission or f"sim-seed{args.seed}", "g1", args.rows, args.cols, args.cell)
    spec.validate(cfg.drive)
    frames: dict = {}
    runner, field = sim_runner(cfg, spec, args.seed, Guards(), args.battery,
                               on_frame=lambda cell, img: frames.__setitem__((cell.row, cell.col), img))
    report = runner.run(spec)
    paths = save_report(report, args.out, frames)

    plan = planned_stats(spec)
    print(f"\nAgriRover simulated round · {spec.rows} rows of {spec.cols} trees, {spec.cell_m} m apart")
    print(f"  status            {report.status}" + (f" ({report.abort_reason})" if report.abort_reason else ""))
    print(f"  stops             {report.cells_scanned} / {spec.rows * spec.cols}")
    print(f"  trees seen        {report.plants_detected}")
    print(f"  flagged (yellow)  {report.cells_flagged}")
    print(f"  path              {report.distance_m:.1f} m driven of {plan['distance_m']} m planned, "
          f"{plan['turns']} turns")
    print(f"  est. duration     {report.est_duration_s / 60:.1f} min "
          f"(drive {report.drive_time_s:.0f} s + {cfg.capture_s + cfg.probe_s:.0f} s per tree)")
    for key, value in agreement(report, field).items():
        print(f"  vision vs truth   {key:<12} {value:.0%}")
    for kind, path in paths.items():
        print(f"  wrote {kind:<6} {path}")
    return 0 if report.status == "completed" else 2


def cmd_run(args: argparse.Namespace) -> int:
    cfg = RoverConfig.from_env()
    guards = Guards()
    if args.sim_hardware:
        def runner_for(spec: MissionSpec) -> MissionRunner:
            return live_sim_runner(cfg, spec, guards, args.seed, args.speedup)
    else:
        from rover.camera import OpenCVCamera, PiCamera
        from rover.drive import SerialDrive
        drive = SerialDrive(cfg.drive, cfg.serial_port, cfg.serial_baud)
        camera = OpenCVCamera() if args.usb_camera else PiCamera()

        def runner_for(spec: MissionSpec) -> MissionRunner:
            # Before each mission the rover must stand on cell (0, 0) facing east.
            return MissionRunner(cfg, drive, camera, guards)

    from rover.link import RoverLink
    try:
        asyncio.run(RoverLink(cfg, runner_for, guards).run_forever())
    except KeyboardInterrupt:
        pass
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="rover", description="AgriRover agent")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sim", help="simulated survey; writes report.json and field-map.svg")
    s.add_argument("--rows", type=int, default=4)
    s.add_argument("--cols", type=int, default=10)
    s.add_argument("--cell", type=float, default=3.0, help="metres from tree to tree")
    s.add_argument("--seed", type=int, default=7)
    s.add_argument("--battery", type=float, default=12.6, help="starting battery voltage")
    s.add_argument("--mission", default=None)
    s.add_argument("--out", default="reports")
    s.set_defaults(func=cmd_sim)

    r = sub.add_parser("run", help="connect to the farm broker and wait for missions")
    r.add_argument("--sim-hardware", action="store_true", help="simulated drive and camera")
    r.add_argument("--usb-camera", action="store_true", help="USB webcam instead of the Pi camera")
    r.add_argument("--seed", type=int, default=7)
    r.add_argument("--speedup", type=float, default=40.0,
                   help="with --sim-hardware: 1 = real time, 40 = 40x faster (default), 0 = instant")
    r.set_defaults(func=cmd_run)

    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
