# AgriRover survey: standard operating procedure

**Status: draft.** Written from the rover's software limits. It has not been run on a real rover, because the chassis is still being built. Update it after the first field survey. The same steps are on screen under Rover, SOP.

**Purpose:** survey one bed, then act on what the rover finds.
**Who:** one trained person, staying with the rover for the whole survey.
**Suits:** low bed crops. Not tree canopies.

## Before you start: required hardware

Do not run a physical rover until these are done:

1. **Fit a physical power-cut switch.** The parts list has none. The e-stop on screen travels over Wi-Fi, so it cannot be the only way to stop the rover.
2. **Add a login to the app.** Today anyone with the address can start or stop the rover.
3. **Check the front bumper** cuts the motors. The firmware is tested on the bench only.

## Before each survey

| # | Step | Pass when |
|---|---|---|
| 1 | Check the weather and the rain reading | No rain, soil not waterlogged |
| 2 | Charge the battery | Full pack. The rover stops itself at 11.1 V |
| 3 | Clean the lens; fit the hood and light | Even light on the soil |
| 4 | New soil type: calibrate | Photos of saturated and dry soil set the two references (`rover/vision.py`) |
| 5 | Walk the bed | No people, animals, hoses or tools in the path |
| 6 | Put the rover on the start corner | Row 1, column 1, facing along row 1 |
| 7 | Test the e-stop and the bumper | Both stop the wheels. Then release |

## During the survey

| # | Step | Pass when |
|---|---|---|
| 8 | Choose the bed and grid; tick the checks; start | Rover shows Surveying |
| 9 | Stay in sight, with the e-stop in reach | Stop at once if anything enters the bed |
| 10 | Watch the map and the battery | Rover moves cell by cell along the path |

## After the survey

| # | Step | Pass when |
|---|---|---|
| 11 | Read how it ended | Completed, or stopped with a reason. A stopped survey is partial |
| 12 | Spot-check three cells it marked as dry, by hand | Soil feels dry. If not, recalibrate before trusting it |
| 13 | Water the marked plants | A person decides. The rover never waters |
| 14 | Look at each yellowing cell | Use Disease check. A flag is not a diagnosis |
| 15 | Note the minutes spent | Compare with walking the bed: that is the proof it saves time |
| 16 | Clean, charge, store dry | Ready for the next survey |

## When it stops

| Reason | What the rover does | What you do |
|---|---|---|
| E-stop | Stops before its next move | Check the bed. Release, then start again |
| Rain | Stops. Wet soil compacts and the electronics must stay dry | Move it under cover. Survey when the soil has drained |
| Low battery | Stops below 11.1 V, before deep discharge | Charge fully, then survey the bed again |
| Lost link | Stops when it cannot reach the farm server | Check the Wi-Fi and the server. Fetch the report from the rover if needed |
| Edge of bed | Refuses any move that leaves the bed (in simulation today) | Check the start corner and the grid size |
| Bumper hit | Motors cut at once, in the firmware | Clear the obstacle. Check the rover for damage |
| Motor controller silent | Stops. The firmware also stops by itself | Check the USB cable and the controller |

A survey cannot resume. Run the bed again from the start corner.

## Numbers behind this procedure

From `edge/rover-agent/rover/config.py` and the motor-controller firmware. These are software limits, not field results.

| Limit | Value |
|---|---|
| Top speed / cruising speed | 0.3 m/s / 0.2 m/s |
| Longest single wheel run | 1.5 s, enforced in firmware |
| Survey size | At most 400 cells, 40 a side |
| Cell size | 0.2 to 1 m |
| Battery stop | 11.1 V (3S pack) |
| Worked example | 40 cells at 0.5 m: 10 m², 19.5 m, about 2.5 minutes |

**Not known yet:** battery endurance, position drift, how well it drives on real soil, and whether soil brightness matches a moisture probe.
