"""AgriRover command line.

    python -m rover sim                  simulated survey, no hardware, no broker
    python -m rover sim --battery 11.3   ... and watch the low-battery guard stop it
    python -m rover run                  on the rover: MQTT + motor controller + Pi camera
    python -m rover run --sim-hardware   full-stack demo: real broker, simulated rover
    python -m rover run --sim-hardware --photos DIR   ... photographing the pictures in DIR, one per stop
    python -m rover jog forward 0.5      on the rover: one measured move, to calibrate (also: jog turn 90)
    python -m rover snap --camera-url http://192.168.1.12/capture   one photo from the rover's ESP32-CAM, saved
    python -m rover run --camera-url URL   photograph each plant with the ESP32-CAM (or set ROVER_CAMERA_URL)

Settings come from the environment, and from a .env file in the folder it is run in (see .env.example here).
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time

from rover.camera import FolderCamera, SimCamera, SimField
from rover.config import RoverConfig, load_env_file
from rover.drive import Pose, SimDrive
from rover.mission import MissionReport, MissionRunner, MissionSpec, SimOptions, planned_stats
from rover.planner import ALONG, CORNERS, Cell, start_heading
from rover.probe import SimProbe
from rover.report import save_report
from rover.safety import Guards, SafetyStop


def sim_runner(cfg: RoverConfig, spec: MissionSpec, seed: int, guards: Guards,
               battery_v: float = 12.6, on_frame=None,
               speedup: float = 0.0, simulated: bool = True, camera=None,
               photos_real: bool = False) -> tuple[MissionRunner, SimField]:
    """speedup 0 = instant; 1 = real time; 10 = ten times faster than the real rover.
    `camera`: photograph with this instead of the simulated camera (e.g. a FolderCamera of real leaf photos);
    `photos_real`: its pictures are of real plants, so the farm server should check them."""
    sim = spec.sim or SimOptions()
    field = SimField(spec.rows, spec.cols, seed=seed, base=sim.base,
                     moisture_spread=12.0 if sim.moisture_spread is None else sim.moisture_spread,
                     planted=None if spec.stops is None else {(c.row, c.col) for c in spec.stops})
    row_m = spec.row_spacing
    sleep = (lambda s: time.sleep(s / speedup)) if speedup > 0 else None
    path = spec.path()
    first = path[0]                         # placed on the start tree, facing its second stop
    drive = SimDrive(cfg.drive, Pose((first.col + 0.5) * spec.cell_m, (first.row + 0.5) * row_m, start_heading(path)),
                     fence=(spec.cols * spec.cell_m, spec.rows * row_m),
                     battery_v=battery_v, sleep=sleep)
    return MissionRunner(cfg, drive, camera or SimCamera(field), guards, on_frame=on_frame, simulated=simulated,
                         probe=SimProbe(field), photos_real=photos_real), field


def live_sim_runner(cfg: RoverConfig, spec: MissionSpec, guards: Guards, seed: int = 7, speedup: float = 40.0,
                    camera=None, photos_real: bool = False) -> MissionRunner:
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
                      on_frame=on_frame, speedup=pace, camera=camera, photos_real=photos_real)[0]


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
    spec = MissionSpec(args.mission or f"sim-seed{args.seed}", "g1", args.rows, args.cols, args.cell,
                       start=args.start, along=args.along)
    spec.validate(cfg.drive)
    frames: dict = {}
    runner, field = sim_runner(cfg, spec, args.seed, Guards(), args.battery,
                               on_frame=lambda cell, img: frames.__setitem__((cell.row, cell.col), img))
    report = runner.run(spec)
    paths = save_report(report, args.out, frames)

    plan = planned_stats(spec)
    print(f"\nAgriRover simulated round · {spec.rows} rows of {spec.cols} trees, {spec.cell_m} m apart, "
          f"from the {spec.start} corner, lanes {'along the rows' if spec.along == 'rows' else 'across the rows'}")
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


def serial_drive(cfg: RoverConfig, port: str | None = None):
    from rover.drive import SerialDrive
    cal = cfg.calibration
    return SerialDrive(cfg.drive, port or cfg.serial_port, cfg.serial_baud,
                       pwm_cruise=cal.pwm_cruise, mps_at_cruise=cal.mps_at_cruise, dps_at_cruise=cal.dps_at_cruise)


def cmd_jog(args: argparse.Namespace) -> int:
    """One measured move on the real rover, to calibrate it: ask for a distance or a turn, measure what it did,
    and put the corrected number in .env. Wheels on the floor, a clear metre in front, a hand on the power switch."""
    cfg = RoverConfig.from_env()
    cal = cfg.calibration
    drive = serial_drive(cfg, args.port)
    print(f"calibration now: ROVER_PWM_CRUISE={cal.pwm_cruise} ROVER_MPS_AT_CRUISE={cal.mps_at_cruise} "
          f"ROVER_DPS_AT_CRUISE={cal.dps_at_cruise}")
    try:
        if args.move == "forward":
            left = args.amount
            while left > 1e-6:                          # the drive takes steps of at most max_step_m
                step = min(left, cfg.drive.max_step_m)
                drive.forward(step)
                left -= step
            print(f"asked for {args.amount} m. Measure how far it went, then set\n"
                  f"  ROVER_MPS_AT_CRUISE = {drive._mps:.3f} x (metres measured) / {args.amount}")
        elif args.move == "turn":
            drive.turn(args.amount)
            print(f"asked for {args.amount} degrees ({'left' if args.amount > 0 else 'right'}). Measure the turn, then set\n"
                  f"  ROVER_DPS_AT_CRUISE = {drive._dps:.1f} x (degrees measured) / {abs(args.amount)}")
    except SafetyStop as stop:
        print(f"stopped: {stop.reason}")
        return 2
    finally:
        drive.stop()
    print(f"battery: {drive.battery_v() if drive.battery_v() is not None else 'not reported yet'} V")
    return 0


def cmd_snap(args: argparse.Namespace) -> int:
    """One photo from the rover's ESP32-CAM, saved to a file: to aim the camera and check it is on the network."""
    from rover.camera import CameraError, HttpCamera
    url = args.camera_url or os.environ.get("ROVER_CAMERA_URL")
    if not url:
        print("give --camera-url http://<camera ip>/capture, or set ROVER_CAMERA_URL", file=sys.stderr)
        return 2
    cam = HttpCamera(url, flash=args.flash)
    t0 = time.monotonic()
    try:
        img = cam.capture(Cell(0, 0))
    except CameraError as exc:
        print(exc, file=sys.stderr)
        return 1
    with open(args.out, "wb") as fh:
        fh.write(cam.last_jpeg or b"")
    print(f"{args.out}: {img.shape[1]} x {img.shape[0]} px, {len(cam.last_jpeg or b'') // 1024} kB, "
          f"{(time.monotonic() - t0) * 1000:.0f} ms")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    cfg = RoverConfig.from_env()
    guards = Guards()
    if args.sim_hardware:
        if args.photos:
            try:
                FolderCamera(args.photos)    # refuse a missing or empty folder now, not at the first mission
            except ValueError as exc:
                print(f"--photos: {exc}", file=sys.stderr)
                return 2

        def runner_for(spec: MissionSpec) -> MissionRunner:
            # with --photos: real leaf pictures, from the first one again on every round
            camera = FolderCamera(args.photos) if args.photos else None
            return live_sim_runner(cfg, spec, guards, args.seed, args.speedup, camera=camera,
                                   photos_real=camera is not None)
    else:
        from rover.camera import HttpCamera, NoCamera, OpenCVCamera, PiCamera
        drive = serial_drive(cfg)
        url = args.camera_url or os.environ.get("ROVER_CAMERA_URL")
        camera = (NoCamera() if args.no_camera else HttpCamera(url, flash=args.flash) if url
                  else OpenCVCamera() if args.usb_camera else PiCamera())

        def runner_for(spec: MissionSpec) -> MissionRunner:
            # Before each mission a person stands the rover on the start tree, facing its second stop.
            return MissionRunner(cfg, drive, camera, guards)

    from rover.link import RoverLink
    if sys.platform == "win32":
        # aiomqtt needs add_reader/add_writer, which Windows' default (Proactor) loop lacks: rehearsing on a Windows PC
        # otherwise never connects. The rover itself runs Linux, where this changes nothing.
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
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
    s.add_argument("--start", choices=CORNERS, default="sw", help="start corner: sw = row 1, tree 1")
    s.add_argument("--along", choices=ALONG, default="rows", help="lanes along the rows, or across them")
    s.add_argument("--seed", type=int, default=7)
    s.add_argument("--battery", type=float, default=12.6, help="starting battery voltage")
    s.add_argument("--mission", default=None)
    s.add_argument("--out", default="reports")
    s.set_defaults(func=cmd_sim)

    r = sub.add_parser("run", help="connect to the farm broker and wait for missions")
    r.add_argument("--sim-hardware", action="store_true", help="simulated drive and camera")
    r.add_argument("--usb-camera", action="store_true", help="USB webcam instead of the Pi camera")
    r.add_argument("--camera-url", default=None, help="the ESP32-CAM's photo URL, http://<ip>/capture (default ROVER_CAMERA_URL)")
    r.add_argument("--flash", action="store_true", help="with the ESP32-CAM: light each photo with its LED")
    r.add_argument("--no-camera", action="store_true", help="drive the round without a camera (every stop reads 'no plant seen')")
    r.add_argument("--photos", metavar="DIR", default=None,
                   help="with --sim-hardware: photograph the pictures in DIR (.jpg/.jpeg/.png, in name order, one per stop)")
    r.add_argument("--seed", type=int, default=7)
    r.add_argument("--speedup", type=float, default=40.0,
                   help="with --sim-hardware: 1 = real time, 40 = 40x faster (default), 0 = instant")
    r.set_defaults(func=cmd_run)

    j = sub.add_parser("jog", help="one measured move on the real rover, to calibrate it")
    j.add_argument("move", choices=("forward", "turn"))
    j.add_argument("amount", type=float, help="metres forward (up to 3), or degrees to turn (+ left, - right)")
    j.add_argument("--port", default=None, help="the motor controller's serial port (default ROVER_SERIAL_PORT)")
    j.set_defaults(func=cmd_jog)

    c = sub.add_parser("snap", help="one photo from the rover's ESP32-CAM, saved to a file")
    c.add_argument("--camera-url", default=None, help="http://<ip>/capture (default ROVER_CAMERA_URL)")
    c.add_argument("--flash", action="store_true", help="light the photo with the camera's LED")
    c.add_argument("--out", default="snap.jpg")
    c.set_defaults(func=cmd_snap)

    args = p.parse_args(argv)
    if args.cmd == "run" and args.photos and not args.sim_hardware:
        p.error("--photos needs --sim-hardware")
    if args.cmd == "jog" and not (0 < args.amount <= 3 if args.move == "forward" else 0 < abs(args.amount) <= 360):
        p.error("forward takes 0-3 metres; turn takes -360 to 360 degrees, not 0")
    load_env_file()                                    # the rover's own .env, if there is one; set variables win
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
