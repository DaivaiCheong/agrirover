"""AgriRover agent — runs on the rover's Raspberry Pi.

Plans a coverage path over a bed, drives it cell by cell, photographs each
cell, and turns what it sees into a survey report and watering proposals.
It never waters anything itself: proposals go to the farmer for approval.
"""
__version__ = "0.1.0"
