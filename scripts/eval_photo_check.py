"""Score the photo check on labelled photos, so any claim about its accuracy has a number and a test set behind it.

    photos/<class folder>/<image>.jpg
    python scripts/eval_photo_check.py photos --map "healthy_leaf=healthy,red_rust_leaf=problem" --out results.json

The folder name is the true class, turned into the app's label by --map. Folders left out of --map are scored only as
"sick or healthy". Run from the repo root; it uses the same prompt the app uses.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.services.disease import HEALTHY, UNSURE, ModelUnavailable, OllamaClassifier  # noqa: E402

IMAGE_TYPES = {".jpg", ".jpeg", ".png"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=pathlib.Path)
    ap.add_argument("--map", default="", help="folder=label,folder=label")
    ap.add_argument("--url", default="http://localhost:11434")
    ap.add_argument("--model", default="gemma4")
    ap.add_argument("--out", type=pathlib.Path)
    args = ap.parse_args()
    truth_of = dict(pair.split("=", 1) for pair in args.map.split(",") if pair)
    model = OllamaClassifier(args.url, args.model)

    rows = []
    for folder in sorted(p for p in args.folder.iterdir() if p.is_dir()):
        for image in sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_TYPES):
            started = time.perf_counter()
            try:
                seen = model.classify(image.read_bytes())
            except ModelUnavailable as exc:
                print(f"{folder.name:24} {image.name:32} FAILED: {exc}", flush=True)
                continue
            rows.append({"folder": folder.name, "file": image.name, "truth": truth_of.get(folder.name), "said": seen.label if seen else UNSURE,
                         "seen": seen.seen if seen else None, "seconds": round(time.perf_counter() - started, 1)})
            print(f"{folder.name:24} {image.name:32} {rows[-1]['said']:18} {rows[-1]['seconds']:6.1f}s", flush=True)

    per = defaultdict(Counter)
    for r in rows:
        per[r["folder"]][r["said"]] += 1
    print("\nTrue folder -> what the model said")
    for folder, said in per.items():
        print(f"  {folder:24} n={sum(said.values()):3}  " + ", ".join(f"{k} {v}" for k, v in said.most_common()))

    answered = [r for r in rows if r["said"] != UNSURE]
    named = [r for r in answered if r["truth"]]
    sick = [r for r in rows if r["truth"] not in (None, HEALTHY) or (r["truth"] is None and HEALTHY not in r["folder"].lower())]
    well = [r for r in rows if r["truth"] == HEALTHY]
    print(f"\nPhotos {len(rows)}, unsure {len(rows) - len(answered)}, median {sorted(r['seconds'] for r in rows)[len(rows) // 2]} s a photo")
    if named:
        print(f"Exact label, where it answered and the class has a label: {sum(r['said'] == r['truth'] for r in named)}/{len(named)}")
    if sick:
        print(f"Sick photos it called healthy (missed): {sum(r['said'] == HEALTHY for r in sick)}/{len(sick)}")
    if well:
        print(f"Healthy photos it called sick (false alarm): {sum(r['said'] not in (HEALTHY, UNSURE) for r in well)}/{len(well)}")
    if args.out:
        args.out.write_text(json.dumps(rows, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
