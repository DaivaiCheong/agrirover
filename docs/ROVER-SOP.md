# AgriRover daily round: standard operating procedure

**Status: draft.** Written from the rover's software limits and the guava plan. It has not been run on a real rover, because the guava rover is not built. Update it after the first field round. The same steps are on screen under Rover, SOP.

**Purpose:** visit every tree in a block, then act on what the app says for today.
**Who:** one trained person, staying with the rover for the whole round.
**How often:** once a day, in the morning, block by block.

## Before any physical run

1. **Fit a physical power-cut switch.** The parts list has none. The e-stop on screen travels over Wi-Fi, so it cannot be the only way to stop the rover.
2. **Add a login to the app.** Today anyone with the address can start or stop the rover.
3. **Check the front bumper** cuts the motors. The firmware is tested on the bench only.
4. **Keep hands clear of the probe arm** while it moves. Its guard and interlock are part of its design.

## Before each round

| # | Step | Pass when |
|---|---|---|
| 1 | Check the weather and the rain reading | No rain, soil not waterlogged |
| 2 | Charge the battery | Full pack. The rover stops itself at 11.1 V |
| 3 | Clean the camera and the probe tip | No soil on the probe: old soil gives false readings |
| 4 | Check the probe in water and in dry soil | Moisture reads high and low as expected |
| 5 | Walk the rows | No people, animals, hoses, ladders or fruit crates |
| 6 | Put the rover at the first tree | Row 1, tree 1, facing along row 1 |
| 7 | Test the e-stop, the power cut and the bumper | Each stops the wheels. Then release |

## During the round

| # | Step | Pass when |
|---|---|---|
| 8 | Choose the block; tick the checks; start | Rover shows On its round |
| 9 | Stay in sight, with the e-stop in reach | Stop at once if anything enters the rows |
| 10 | Watch the map and the battery | Rover stops at each tree and readings appear |

## After the round

| # | Step | Pass when |
|---|---|---|
| 11 | Read how it ended | Completed, or stopped with a reason. A stopped round is partial |
| 12 | Hand-check three trees it marked dry | Soil feels dry. If not, recalibrate before trusting it |
| 13 | Give the water on Today | A person decides. The rover never waters |
| 14 | Feed only if Today says feed | If it says hold, do not feed: EC is already high |
| 15 | Go and look at each marked tree | Use Check a photo. A flag is not a diagnosis |
| 16 | Note the minutes spent | Compare with walking the rows: that is the proof it saves time |
| 17 | Clean, charge, store dry | Ready for tomorrow |

## Every cycle

| # | Step | Pass when |
|---|---|---|
| 18 | Send a leaf sample at the end of the flush | Lab result compared with the leaf ranges. This, not the probe's N, P, K, changes a dose |
| 19 | Calibrate moisture on your own soil | Probe readings compared with a sample weighed wet and dry |

## When it stops

| Reason | What the rover does | What you do |
|---|---|---|
| E-stop | Stops before its next move | Check the block. Release, then start again |
| Rain | Stops. Wet soil compacts and the electronics must stay dry | Move it under cover. Run the round when the soil has drained |
| Low battery | Stops below 11.1 V, before deep discharge | Charge fully, then run the round again |
| Lost link | Stops when it cannot reach the farm server | Check the Wi-Fi and the server. Fetch the report from the rover if needed |
| Edge of block | Refuses any move that leaves the block (in simulation today) | Check the start tree and the rows and spacing |
| Bumper hit | Motors cut at once, in the firmware | Clear the obstacle. Check the rover for damage |
| Motor controller silent | Stops. The firmware also stops by itself | Check the USB cable and the controller |

A round cannot resume. Run the block again from the first tree.

## Numbers behind this procedure

From `edge/rover-agent/rover/config.py` and the motor-controller firmware. These are software limits, not field results.

| Limit | Value |
|---|---|
| Top speed / cruising speed | 0.3 m/s / 0.2 m/s |
| Longest single wheel run | 1.5 s, enforced in firmware |
| Round size | At most 400 trees, 40 a side |
| Spacing | 0.2 to 10 m |
| Stop at a tree | About 41 s: 1 s photo, 40 s probe (**an estimate**) |
| Battery stop | 11.1 V (3S pack) |
| Worked example | 16 trees at 5 x 5 m (75 m): about 18 minutes. 100 trees at 3 x 3.5 m: about 2 hours |

**Not known yet:** battery endurance, how well it steers between trunks, how it drives on real soil, how long a probe takes to settle, and whether it can push into dry-season soil.
