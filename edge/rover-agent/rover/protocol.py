"""Serial protocol between the rover's Raspberry Pi and its motor controller.

One ASCII line per frame, NMEA style:   $BODY*XX\\n
XX is the XOR of every byte of BODY, as two upper-case hex digits.

Pi -> controller
    $DRV,<seq>,<left>,<right>,<ms>*XX   wheel PWM -255..255 (+ = forward); ms is clamped by the firmware
    $STOP,<seq>*XX                      stop now
    $PING,<seq>*XX                      keep-alive

Controller -> Pi
    $ACK,<seq>*XX                       accepted (values may have been clamped)
    $NAK,<seq>,<reason>*XX              rejected: bad_frame | bad_checksum | bumper
    $DONE,<seq>,<reason>*XX             run ended: elapsed | stopped | watchdog | bumper
    $BAT,<millivolts>*XX                battery, once a second

The firmware half lives in edge/rover-motor-controller/drive_protocol.h and is
tested against the same vectors as tests/test_protocol.py.
"""
from __future__ import annotations

MAX_PWM = 255


class FrameError(ValueError):
    pass


def checksum(body: str) -> str:
    c = 0
    for byte in body.encode("ascii"):
        c ^= byte
    return f"{c:02X}"


def frame(*fields: object) -> str:
    body = ",".join(str(f) for f in fields)
    if "*" in body or "$" in body or "\n" in body:
        raise FrameError("reserved character in frame body")
    return f"${body}*{checksum(body)}\n"


def drv(seq: int, left: int, right: int, ms: int) -> str:
    if not (-MAX_PWM <= left <= MAX_PWM and -MAX_PWM <= right <= MAX_PWM):
        raise FrameError("pwm out of range")
    if ms <= 0:
        raise FrameError("duration must be positive")
    return frame("DRV", seq, int(left), int(right), int(ms))


def stop(seq: int) -> str:
    return frame("STOP", seq)


def ping(seq: int) -> str:
    return frame("PING", seq)


def parse(line: str) -> list[str]:
    """Validate a received line and return its fields, e.g. ['DONE', '7', 'elapsed']."""
    text = line.strip()
    if not text.startswith("$") or "*" not in text:
        raise FrameError("bad_frame")
    body, _, received = text[1:].rpartition("*")
    if len(received) != 2 or checksum(body) != received.upper():
        raise FrameError("bad_checksum")
    fields = body.split(",")
    if not fields[0]:
        raise FrameError("bad_frame")
    return fields
