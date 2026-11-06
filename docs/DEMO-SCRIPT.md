# AgriRover: 5-minute demo (judges and investors)

**One sentence:** a rover visits every guava tree each day, reads the soil under it, and tells the farmer what to do; when a tree looks wrong, one phone photo plus that tree's own soil readings says why.

Photos: `farm-photos\demo\` (1-healthy-leaf, 2-yellow-leaf, 3-mealybug). They come from a public dataset, CC BY 4.0: credit it on a slide (`CREDITS.txt`).

## Before you start (15 minutes before)

1. Docker Desktop running; `http://localhost:5173` opens.
2. **Wi-Fi works.** The photo check uses Ollama's online service. Check one photo once to warm it up (the first can take 20-30 s).
3. **Fresh rounds:** Today's first figure should read **"Rover today: 5 of 5 blocks"**. If not, open Rover and run a round on each missing block (tick the three checks, Start round, about 30 s each).
4. Close other tabs. Browser zoom 110-125 % so the back row can read it.
5. Open these tabs in order: **Today**, **Rover**, **Health**, **Finance**.

## The 5 minutes

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | **Today** | Point at the four figures, then the first rows of "What to do today" | "Guava farmers decide water and feed by feel. Too little water at bloom drops the flowers; feeding blind wastes money or starves the tree. This is the farmer's morning: what to do, block by block, worked out from this morning's rover round." |
| 0:45 | **Rover** › Daily round | Point at Found today, then the block map. Choose **G2 Commercial block**. | "The rover stops at every tree, pushes a probe into the soil, and reads moisture, EC and pH. Each square is a tree. The **!** marks a tree with yellow leaves." |
| 1:30 | Rover map | Tap the tree with **!**: **R2 T1** (second row from the bottom, first tree) | "This is R2 T1. The rover can't take photos yet, so for now the farmer is the camera." |
| 2:00 | At this tree | **Photo of R2 T1** → choose `2-yellow-leaf.jpg` → **Check photo** (wait about 10 s) | "The AI reads the photo: yellow between the veins, **feed or soil, not a disease**. Then the important part: **this tree's soil**. Its EC is low, so it's likely hungry. Feed on schedule and take a leaf test. No fungicide. A wrong spray costs money and does nothing." |
| 3:00 | At this tree | **Save to R2 T1**. Point at the dark dot on the map | "Saved with the tree's readings, so an expert can confirm it, and every confirmed photo trains a better model for our own farms." |
| 3:20 | **Health** › Disease guide | Scroll once | "The AI only answers from this guide, built from published sources. It never invents a spray dose." |
| 3:45 | **Finance** | Point at the four figures, then By block | "And the farmer sees where the money goes, block by block. These are sample figures." |
| 4:15 | **Rover** › What it does | Point down the Status column | "We're honest about where we are: the software and the advice work today, in simulation. Next is the chassis and probe arm, then a two-week hand-carried probe round to prove trees really differ." |
| 4:45 | | Close | "One rover, every tree, every day, and the farmer knows what to do." |

## If they ask

| Question | Answer |
|---|---|
| How accurate is the photo AI? | Healthy or not: good. Naming the problem: about half on 150 public test photos (61 of 120), and the app says "about 4 in 10" to stay safe. It is triage; an expert confirms. Our own farm photos will raise it. |
| Is the rover real? | The software runs the real rover code against a simulated field. Hardware is being built: chassis, probe arm, side camera. |
| Why a rover and not fixed sensors? | A fixed sensor reads one spot. The rover reads every tree. If our hand-carried test shows the trees don't differ, fixed probes win, and we'll say so. |
| Why one variety? | Two on this demo farm: Local Khmer (the usual tree) and Kimju (the improved commercial one). The rules follow the crop stage, not the variety. |
| Does it water the trees? | No. It advises. Nothing in the app opens a valve. |

## If something breaks

| Problem | Do |
|---|---|
| Photo check fails or hangs | No internet: say "it uses an online model; here's a saved answer" and open **Health › Photo library**, or switch to Today and carry on. |
| "Rover today" not 5 of 5 | Run the missing rounds before starting (step 3). The demo still works with one: G2 is what matters. |
| R2 T1 has no **!** | Tap any tree with **!** in G2. The soil line still explains that tree. |
| App won't load | Docker Desktop, then `docker compose --profile sim up -d` in the project folder. |
