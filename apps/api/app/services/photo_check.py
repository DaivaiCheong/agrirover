"""The photo check: what a plant photo shows, checked against the tomato disease guide.

Triage, not diagnosis. get_classifier() returns None when no model is configured (OLLAMA_MODEL unset), and every caller
then says so instead of inventing a result. Photos go only to the Ollama server named in the settings: by default this
machine; pointing OLLAMA_URL at ollama.com sends them to that service and needs OLLAMA_API_KEY.

Two steps, because the two jobs score very differently: first healthy, problem or unsure, which a vision model does well;
then, only with PHOTO_MATCHES on, the two closest entries of the guide. A language model's own "90 % sure" is not a
measured probability, so a finding never carries a confidence.
Ported from the earlier PostgreSQL line (services/disease.py, crop_guides.py, rover_photos.py) for the MongoDB API.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.core.config import settings
from app.services.tomato import DISEASES

TIMEOUT_S = 300.0                   # the first photo also loads the model into memory
HEALTHY, PROBLEM, UNSURE, NONE = "healthy", "problem", "unsure", "none"
WHERE = ("young_growth", "old_leaves", "all_leaves", "fruit")
# what kind of finding a guide entry is, by its card group: what the farmer does next differs for each
KIND_OF_GROUP = {"fungus": "disease", "water mould": "disease", "bacteria": "disease", "virus": "disease", "alga": "disease",
                 "roots": "disease", "feed": "nutrient", "water": "nutrient", "insect": "pest"}


@dataclass(frozen=True)
class Guide:
    crop: str
    name: str
    normal: str                     # what is normal and must not be called a problem
    prompt: str                     # the guide as the model reads it
    by_id: dict = field(default_factory=dict)


def _prompt(entries: list[dict]) -> str:
    lines = []
    for d in entries:
        parts = [f"{d['id']}: {d['title']}."]
        for key, word in (("leaf", "Leaf"), ("fruit", "Fruit"), ("notToConfuse", "Not to confuse with"), ("favours", "Favoured by")):
            if d.get(key):
                parts.append(f"{word}: {d[key]}")
        lines.append(" ".join(parts))
    return "\n".join(lines)


TOMATO = Guide("tomato", "Tomato", "Fine hairs on tomato leaves and stems, and a pale green on young growth, are normal.",
               _prompt(DISEASES), {d["id"]: d for d in DISEASES})


def kind_of(guide: Guide, label: str | None) -> str:
    """healthy | disease | nutrient | pest | problem (no name given) | unsure (no answer)."""
    if label is None:
        return "unsure"
    if label in (HEALTHY, PROBLEM):
        return label
    entry = guide.by_id.get(label)
    return KIND_OF_GROUP.get(entry["card"]["group"], "problem") if entry else "problem"


def title_of(guide: Guide, label: str | None) -> str:
    if label is None:
        return "Not sure: go and look"
    if label == HEALTHY:
        return "Looks healthy"
    if label == PROBLEM:
        return "A problem: go and look"
    entry = guide.by_id.get(label)
    return f"Possible {entry['title'].lower()}" if entry else label


def finding(guide: Guide, label: str | None, also: str | None, seen: str | None, photo_id: str | None, *,
            status: str = "ok", problem: str | None = None) -> dict:
    """What the photo check said about one plant, the same shape live (on the Rover map) and stored (an inspection)."""
    entry = guide.by_id.get(label) if label else None
    card = None if entry is None else {**entry["card"], "id": entry["id"], "title": entry["title"], "why": entry.get("favours"),
                                       "do": entry.get("do")}
    return {"status": status, "label": label, "title": title_of(guide, label), "kind": kind_of(guide, label), "seen": seen,
            "also": guide.by_id[also]["title"] if also in guide.by_id else None, "crop": guide.crop, "photoId": photo_id,
            "problem": problem, "card": card}


def screen_prompt(g: Guide) -> str:
    crop = g.name.lower()
    return (
        f"You are checking one close-up photo of a {crop} leaf or fruit for a farmer. Look only at what is visible.\n"
        f"Choose one label:\n- {HEALTHY}: evenly coloured and clean, with no spots, patches, holes or damage. {g.normal}\n"
        f"- {PROBLEM}: any spots, patches, yellowing, mould, scabs, holes, insects, scorching or splits.\n"
        f"- {UNSURE}: not a {crop} leaf or fruit, or too blurred or dark to judge.\n"
        "Do not name a disease. In `seen`, describe the visible signs in one short sentence.\n"
        'Reply only with JSON: {"seen": "...", "label": "..."}'
    )


def match_prompt(g: Guide) -> str:
    return (
        f"This photo of a {g.name.lower()} leaf or fruit shows a problem. Use this guide, and go by what is visible.\n\n" + g.prompt + "\n\n"
        f"First give `where`: which part carries the signs ({', '.join(WHERE)}). Then `label` is the entry that fits best, and `also` "
        f"the next closest entry. Use {NONE} if nothing else fits, and {UNSURE} as `label` if no entry fits. "
        "Use only the ids at the start of each entry. Reply only with JSON: " + '{"where": "...", "label": "...", "also": "..."}'
    )


def match_schema(g: Guide) -> dict:
    return {"type": "object", "required": ["where", "label", "also"],
            "properties": {"where": {"type": "string", "enum": list(WHERE)},
                           "label": {"type": "string", "enum": [*g.by_id, UNSURE]}, "also": {"type": "string", "enum": [*g.by_id, NONE]}}}


SCREEN_SCHEMA = {"type": "object", "required": ["seen", "label"],
                 "properties": {"seen": {"type": "string"}, "label": {"type": "string", "enum": [HEALTHY, PROBLEM, UNSURE]}}}


class ModelUnavailable(Exception):
    """The configured model could not be reached or could not read the photo."""


@dataclass(frozen=True)
class Seen:
    label: str
    confidence: float | None = None
    seen: str | None = None
    also: str | None = None


class Classifier(Protocol):
    def classify(self, data: bytes, guide: Guide = TOMATO) -> Seen | None:
        """What the photo shows, or None when the model is not sure. Raises ModelUnavailable when it cannot answer."""


class OllamaClassifier:
    def __init__(self, url: str, model: str, api_key: str | None = None, post=httpx.post, matches: bool = False):
        self.url, self.model, self._post, self.matches = url.rstrip("/"), model, post, matches
        self._headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    def _ask(self, prompt: str, schema: dict, image: str) -> dict:
        body = {"model": self.model, "stream": False, "think": False, "format": schema, "options": {"temperature": 0, "num_ctx": 8192},
                "messages": [{"role": "user", "content": prompt, "images": [image]}]}
        try:
            res = self._post(f"{self.url}/api/chat", json=body, headers=self._headers, timeout=TIMEOUT_S)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"cannot reach the photo model at {self.url}") from exc
        if res.status_code == 404:
            raise ModelUnavailable(f"photo model {self.model} is not installed: run `ollama pull {self.model}`")
        if res.status_code in (401, 403):
            raise ModelUnavailable("the Ollama key was refused: check OLLAMA_API_KEY")
        if res.status_code == 429:
            raise ModelUnavailable("the online model's usage limit is reached: try again later")
        if res.status_code != 200:
            raise ModelUnavailable(f"photo model answered {res.status_code}")
        try:
            text = res.json()["message"]["content"]
            return json.loads(text[text.index("{"):text.rindex("}") + 1])
        except (ValueError, KeyError, TypeError) as exc:
            raise ModelUnavailable("the photo model gave an answer that could not be read") from exc

    def classify(self, data: bytes, guide: Guide = TOMATO) -> Seen | None:
        image = base64.b64encode(data).decode("ascii")
        screen = self._ask(screen_prompt(guide), SCREEN_SCHEMA, image)
        label, seen = screen.get("label"), screen.get("seen")
        if label == HEALTHY:
            return Seen(HEALTHY, None, seen)
        if label != PROBLEM:
            return None
        if not self.matches:
            return Seen(PROBLEM, None, seen)
        match = self._ask(match_prompt(guide), match_schema(guide), image)
        best, also = match.get("label"), match.get("also")
        if best not in guide.by_id:
            return Seen(PROBLEM, None, seen)
        return Seen(best, None, seen, also if also in guide.by_id and also != best else None)


def get_classifier() -> Classifier | None:
    if not settings.ollama_model:
        return None
    return OllamaClassifier(settings.ollama_url, settings.ollama_model, settings.ollama_api_key, matches=settings.photo_matches)


NO_MODEL = "No photo model is set up on this server (OLLAMA_MODEL)."
