# Guava photos: who confirms them and how to collect them (2026-11-05)

Only a photo an expert has confirmed can train or test a model. The farmer's guess and the model's answer are kept beside it and never count. Save photos in **Health > Check a photo**. Experts confirm them in **Health > Photo library**.

## Who can confirm the labels

Nobody has been contacted yet, and no Siem Reap contact or guava specialist was found. The sources are from 2011 to 2025, so check that each one is still active.

| Ask, in this order | Why | Check first |
|---|---|---|
| Siem Reap Provincial Department of Agriculture | Nearest. A provincial office helped lead a plant clinic in 2016 | Whether it has a plant doctor, and whether it runs clinics now |
| A plant clinic (General Directorate of Agriculture with CABI) | [Farmers can bring samples or send photos, and what the advisor cannot identify goes to the GDA laboratory](https://blog.plantwise.org/2016/11/22/plant-clinic-established-in-cambodia-climate-smart-village-to-address-crop-pests/) | Whether a clinic is near Siem Reap |
| Royal University of Agriculture, Phnom Penh | [Cambodia's first plant doctors trained there in 2011](https://blog.plantwise.org/2011/10/31/plant-clinics-begin-in-cambodia/), and [plant protection staff trained there in virus diagnosis in 2016](https://ipmil.cired.vt.edu/integrated-pest-management-innovation-lab-conducts-workshop-diagnosis-management-plant-virus-diseases-cambodia/) | Who in plant pathology knows fruit trees |
| Institute of Technology of Cambodia, Plant Health Lab | [Lab tests for plant diseases, including PCR](https://itc.edu.kh/plant-health-lab/). Useful when a photo cannot settle it | Whether it takes samples from outside. Its listed work is mostly rice |

**A message to send:**

> We grow guava in Siem Reap and are collecting photos of leaf and fruit problems from our own trees. We need a plant specialist to look at the photos and say what each one shows, and to tell us when a photo cannot show it. We would send about 50 photos at a time, with the block, the date and the soil readings. Can you do this, or suggest someone? Is there a fee?

## How to judge the labels

- Use **For the expert** in the Photo library: a zip with the photos, a sheet to fill in, and the words to use. Type the answers in with **Confirm**, or let the expert use the screen on a visit.
- "Cannot tell from a photo" is a useful answer. Roots, nematodes and wilt need a sample: leave those unconfirmed until a lab or a dug-up root settles them.
- Give a second expert about 1 photo in 10, and count how often they agree. Experts differ too: [one maize study reports high variation between raters](https://bmcresnotes.biomedcentral.com/track/pdf/10.1186/s13104-018-3548-6), and [one labelling service asks for a Fleiss' kappa of at least 0.60](https://catalogue.agrifoodtef.eu/IT/services/S00290). That is a working rule from a company, not a standard.

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
4. Decide the pass mark per disease with the agronomist before seeing the results, and count how often it misses a sick tree.
5. Only names that pass reach a farmer, and always as "have a specialist confirm".

`scripts/eval_photo_check.py` scores an Ollama model on the **Confirmed** download. A trained model needs its own script, and Ultralytics YOLO is AGPL-3.0, so check that licence before selling a product built on it.

**Keep the photos safe:** they are files in `farm-photos/`, git-ignored. Back that folder up with the database. There is no login yet, so anyone on the network can see, confirm or delete them, and "Confirmed by" is a typed name. Add a login before an expert works on this from outside the farm.
