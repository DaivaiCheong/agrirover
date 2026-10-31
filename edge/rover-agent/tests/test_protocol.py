import pytest

from rover import protocol

# Same vectors as edge/rover-motor-controller/test/test_drive_protocol.cpp
VECTORS = {
    "DRV,7,150,150,1200": "74",
    "DRV,8,-300,300,5000": "50",
    "STOP,9": "0D",
    "PING,10": "3D",
    "ACK,7": "52",
    "DONE,7,elapsed": "5D",
}


@pytest.mark.parametrize("body,expected", VECTORS.items())
def test_checksum_vectors(body, expected):
    assert protocol.checksum(body) == expected


def test_drv_frame():
    assert protocol.drv(7, 150, 150, 1200) == "$DRV,7,150,150,1200*74\n"


def test_round_trip():
    assert protocol.parse(protocol.frame("DONE", 7, "elapsed")) == ["DONE", "7", "elapsed"]


def test_corrupted_frame_is_rejected():
    line = protocol.drv(7, 150, 150, 1200).replace("150,1200", "150,9200")
    with pytest.raises(protocol.FrameError, match="bad_checksum"):
        protocol.parse(line)


@pytest.mark.parametrize("line", ["", "DRV,1*00", "$DRV,1", "$*00", "$DRV,1*7"])
def test_malformed_lines(line):
    with pytest.raises(protocol.FrameError):
        protocol.parse(line)


def test_drv_refuses_out_of_range_pwm_and_duration():
    with pytest.raises(protocol.FrameError):
        protocol.drv(1, 300, 0, 100)
    with pytest.raises(protocol.FrameError):
        protocol.drv(1, 100, 100, 0)
