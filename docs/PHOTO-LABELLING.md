# Guava photos: how to collect and confirm them (2026-11-05)

Only a confirmed photo can train or test a model. The first guess and the model's answer are kept beside it and never count. Save photos in **Health > Check a photo**, and confirm them in **Health > Photo library**. A model scored against these labels is only as right as the person who confirmed them.

## How to judge the labels

- Compare each photo with the **Disease guide**. "Cannot tell from a photo" is a useful answer: leave it unconfirmed.
- Roots, nematodes and wilt need a dug-up root, not a photo.
- **To confirm** in the Photo library downloads a zip with the photos, a sheet and the words to use, for anyone helping away from the farm.

## How to take the photos

These are our working rules, built from what went wrong in `GUAVA-RESEARCH.md`. They do not come from a study.

1. **On the tree.** Do not pick the leaf or lay it on paper. The dataset we tested was largely plain backgrounds, and a rover will never see that.
2. **Many days and trees.** The target is 100 confirmed photos of each problem over at least 3 separate days, and from as many trees as possible. A model tested on the day it trained on can score well by knowing the day.
3. **One new leaf or fruit per photo.** Ten photos of one leaf are worth about one.
4. **Healthy too, on the same days.** Otherwise "healthy" can come to mean "that day's light".
5. **Mixed light.** Take some in sun, some in shade, some overcast.
6. **Say which tree.** Enter the row and tree, so the photo is kept with that tree's soil readings. Readings from a simulated round are marked simulated, and must not be used as real.

## When a model may name a disease

1. Train only on confirmed photos.
2. Test on whole days the model never saw. Do not split photos from one day between training and testing.
3. Black out the leaf or fruit and test again. The score should fall close to guessing. Ours stayed at 51.5 % against 16 %, which is how we knew it was not ready.
4. Decide the pass mark per disease before seeing the results, and count how often it misses a sick tree.
5. Until then, a name reaches a farmer only as a "possible match" to compare, and it never triggers advice by itself.

`scripts/eval_photo_check.py` scores an Ollama model on the **Confirmed** download. A trained model needs its own script, and Ultralytics YOLO is AGPL-3.0, so check that licence before selling a product built on it.

**Keep the photos safe:** they are files in `farm-photos/`, git-ignored. Back that folder up with the database. There is no login yet, so anyone on the network can see, confirm or delete them, and "Confirmed by" is a typed name. Add a login before anyone works on this from outside the farm.
