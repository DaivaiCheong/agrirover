# AgriRover: 5-minute demo (judges and investors)

**One sentence:** we are building a rover that checks guava leaf nutrients and tells the farmer what to do; today its software runs a simulated soil round, and one phone photo plus a tree's soil readings suggests why it looks wrong.

**Say this plainly: the rover cannot check a nutrient yet.** The screens below show the soil round and photo check, the base it will sit on. Plant health, Leaf tests records lab results, and it stays empty until a real one comes: **never type in made-up figures to fill it for a demo.** Against LENS as a nutrient checker we score 21 / 100 by our own rating ([comparison](PICKETA-RESEARCH.md#compared-with-lens)). If this demo is for judges or investors, say so in the opening line.

**The shape of every screen:** Read (measured data) → Find (the problem, with its number against the target) → Act (one thing to do). Today and Health each fit one screen. Why this shape: [PICKETA-RESEARCH.md](PICKETA-RESEARCH.md).

Photos: `farm-photos\demo\` (1-healthy-leaf, 2-yellow-leaf, 3-mealybug). They come from a public dataset, CC BY 4.0: credit it on a slide (`CREDITS.txt`).

## Before you start (15 minutes before)

1. Docker Desktop running; `http://localhost:5173` opens.
2. **Wi-Fi works.** The photo check uses Ollama's online service. Check one photo once to warm it up (the first can take 20-30 s).
3. **Fresh rounds:** Today's first figure should read **"Rover today: 5 of 5 blocks"**. If not, open Rover and run a round on each missing block (tick the three checks, Start round, about 30 s each).
4. Close other tabs. Browser zoom 110-125 % so the back row can read it.
5. Open these tabs in order: **Today**, **Health**, **Rover**, **Finance**. On Health, check the 3D farm shows and you can turn it.

## The 5 minutes

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | **Today** (Problems) | Point left to right along **Read → Find → Act**, then at the red card **G3: 51.5 % ↓, target 65–75 → Water 237 L today** | "Guava farmers decide water and feed by feel. We start from measured data, not guesses: the rover **read** 68 trees this morning, the app **found** 8 problems, 3 urgent, and each one says **what to do**. G3 is at bloom with soil at 51.5 %, below its 65 % target: flowers will drop, so it gets 237 litres today." |
| 0:40 | **Health** | The whole farm in 3D. Drag once to turn it. Point at the orange **!** marks and the list "To look at 4" | "This is the farm. The rover visited every tree this morning. Four trees have yellow leaves worth a closer look. They're marked, so nobody walks every row to find them." |
| 1:20 | Health, 3D | Click the **!** on **G2 Commercial block · R2 T1** (or the first line of the list). The camera flies to G2 | "R2 T1. Under it, the rover read EC 0.68 against a target of 1.2 to 1.8: the arrow says low." |
| 1:45 | Right column | **Photo of R2 T1** → `2-yellow-leaf.jpg` → **Check photo** (about 5 s) | "The rover can't take photos yet, so the farmer is the camera. The AI reads the leaf: **feed or soil, not a disease**. And **this tree's soil** agrees: likely low feed. Feed on schedule and take a leaf test. No fungicide: a wrong spray costs money and does nothing." |
| 2:40 | Right column | **Save to R2 T1**. The dark dot appears on the tree in 3D | "Saved with the tree's readings, so an expert can confirm it. Every confirmed photo trains a better model for our farms." |
| 3:00 | **Rover** | Click the **G5 Harvest block** chip above the 3D, tick the three checks, **Start round**. Talk while it drives (about 30 s) | "This is the rover's software running a round: tree by tree, probe in the soil, in the right order. The hardware is being built around this same code." |
| 3:45 | **Finance** | Point at the four figures, then By block | "And the farmer sees where the money goes, block by block. These are sample figures." |
| 4:15 | **Rover** › What it does | Point down the Status column | "We're honest about where we are: the software and the advice work today, in simulation. The rover does not check nutrients yet. First we send guava leaves to a lab and record them here, under Leaf tests, to prove blocks really differ, then we test a scanner against those lab results, and only then does it go on the rover." |
| 4:45 | | Close | "Collect the leaf, scan it, act, for guava. Today, the software. Next, the proof." |

**3D controls:** drag to turn, scroll to zoom, the chips at the top jump to a block or back to the whole farm. On Rover, **Map** switches to the flat map if the 3D ever misbehaves.

## If they ask

| Question | Answer |
|---|---|
| How accurate is the photo AI? | Healthy or not: good. Naming the problem: about half on 150 public test photos (61 of 120), and the app says "about 4 in 10" to stay safe. It is triage; an expert confirms. Our own farm photos will raise it. |
| Is the rover real? | The software runs the real rover code against a simulated field. The hardware does not exist yet in this form: chassis, leaf scanner, side camera, soil probe arm. |
| How is this different from Picketa's LENS? | We follow their concept: collect a leaf, scan it, act. LENS is a working product on potato, corn, canola, soy and wheat, and sells to agronomists at US$10,000 a year. Ours records lab results today; it has no scanner. What we add is guava, which they do not list, soil readings that help explain a low leaf, and a rover to carry it. We have no scanner result yet. |
| Can it read all 13 nutrients? | No. We plan to start with N, P, K and Mg as low, OK or high, and only show a nutrient after it passes against a lab. Low-cost scanners are good on nitrogen and weak on potassium and magnesium in the work we found. |
| Why a rover and not a person with a scanner? | That is what we have to prove. While a person picks the leaves, a rover may add little, and we will time it. If it does not earn its cost, we'll say so. |
| Why a rover and not fixed sensors? | A fixed sensor reads one spot in the soil. It cannot read a leaf. For soil alone, a few fixed probes may win. |
| Why one variety? | Two on this demo farm: Local Khmer (the usual tree) and Kimju (the improved commercial one). The rules follow the crop stage, not the variety. |
| Does it water the trees? | No. It advises. Nothing in the app opens a valve. |

## If something breaks

| Problem | Do |
|---|---|
| Photo check fails or hangs | No internet: say "it uses an online model; here's a saved answer" and open **Health › Photo library**, or switch to Today and carry on. |
| "Rover today" not 5 of 5 | Run the missing rounds before starting (step 3). The demo still works with one: G2 is what matters. |
| R2 T1 has no **!** | Click any tree in the "To look at" list. The soil line still explains that tree. |
| 3D is blank or slow | Use the "To look at" list on Health (it does the same), and **Map** on Rover. |
| App won't load | Docker Desktop, then `docker compose --profile sim up -d` in the project folder. |
