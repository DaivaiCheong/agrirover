"""Disease photo check: the classifier contract, and Gemma on Ollama behind it.

Triage, not diagnosis. get_classifier() returns None when no model is configured, and the endpoint then says so
instead of inventing a result. Photos go to the Ollama server named in the settings and nowhere else: by default this
machine. Pointing OLLAMA_URL at ollama.com sends them to that service, and needs OLLAMA_API_KEY.

Two steps, because the two jobs score very differently (docs/GUAVA-RESEARCH.md). First healthy, problem or unsure, which
it does well. Then, only with PHOTO_MATCHES on, it reads the disease guide and gives its two closest matches. On unseen
photos local gemma4 got 18 names in 119 and said anthracnose 27 times on a set with none, so this is off by default.
Hosted gemma4:31b got 52 in 120: still "possible matches" for a person to compare, never a trigger for advice.

A language model's own "90 % sure" is not a measured probability, so `confidence` stays None. A trained model with
measured accuracy can fill it in behind the same contract, and only then does a result run the soil check on its own.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import settings
from app.services.guava_diseases import BY_ID, prompt_text

TIMEOUT_S = 300.0                   # the first photo also loads the model into memory
HEALTHY, PROBLEM, UNSURE, NONE = "healthy", "problem", "unsure", "none"
SCREEN_PROMPT = (
    "You are checking one close-up photo of a guava leaf or fruit for a farmer. Look only at what is visible.\n"
    f"Choose one label:\n- {HEALTHY}: evenly coloured and clean, with no spots, patches, holes or damage. Natural speckles on guava skin are fine.\n"
    f"- {PROBLEM}: any spots, patches, yellowing, mould, scabs, holes, insects, scorching or splits.\n"
    f"- {UNSURE}: not a guava leaf or fruit, or too blurred or dark to judge.\n"
    "Do not name a disease. In `seen`, describe the visible signs in one short sentence.\n"
    'Reply only with JSON: {"seen": "...", "label": "..."}'
)
SCREEN_SCHEMA = {"type": "object", "required": ["seen", "label"],
                 "properties": {"seen": {"type": "string"}, "label": {"type": "string", "enum": [HEALTHY, PROBLEM, UNSURE]}}}
# `where` comes first so the model looks at which leaves carry the signs before it picks a name: young growth points to
# rust, old leaves coloured between the veins to a feed shortage. On the 150 held-out photos this took right names from
# 52 to 61 of 120. A forced list of sign types as well scored worse (51): it had no word for some signs (docs/GUAVA-RESEARCH.md).
WHERE = ("young_growth", "old_leaves", "all_leaves", "fruit")
MATCH_PROMPT = (
    "This photo of a guava leaf or fruit shows a problem. Use this guide, and go by what is visible.\n\n" + prompt_text() + "\n\n"
    f"First give `where`: which part carries the signs ({', '.join(WHERE)}). Compare young shoots at the tips with older leaves lower down. "
    f"Then `label` is the entry that fits best, and `also` the next closest entry. Use {NONE} if nothing else fits, and {UNSURE} as `label` if no entry fits. "
    f"Use only the ids at the start of each entry. Reply only with JSON: " + '{"where": "...", "label": "...", "also": "..."}'
)
MATCH_SCHEMA = {"type": "object", "required": ["where", "label", "also"],
                "properties": {"where": {"type": "string", "enum": list(WHERE)},
                               "label": {"type": "string", "enum": [*BY_ID, UNSURE]}, "also": {"type": "string", "enum": [*BY_ID, NONE]}}}


class ModelUnavailable(Exception):
    """The configured model could not be reached or could not read the photo."""


@dataclass(frozen=True)
class Seen:
    label: str
    confidence: float | None = None    # a measured probability, or None when the model cannot give one
    seen: str | None = None            # what it says it saw, in its own words
    also: str | None = None            # the next closest match in the guide


class Classifier(Protocol):
    def classify(self, data: bytes) -> Seen | None:
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
            raise ModelUnavailable(f"cannot reach the disease model at {self.url}") from exc
        if res.status_code == 404:
            raise ModelUnavailable(f"disease model {self.model} is not installed: run `ollama pull {self.model}`")
        if res.status_code in (401, 403):
            raise ModelUnavailable("the Ollama key was refused: check OLLAMA_API_KEY")
        if res.status_code == 402:
            raise ModelUnavailable(f"{self.model} is not included in your Ollama plan")
        if res.status_code == 429:
            raise ModelUnavailable("the online model's usage limit is reached: try again later")
        if res.status_code != 200:
            raise ModelUnavailable(f"disease model answered {res.status_code}")
        try:
            text = res.json()["message"]["content"]
            return json.loads(text[text.index("{"):text.rindex("}") + 1])       # the hosted service can wrap its JSON in a code fence
        except (ValueError, KeyError, TypeError) as exc:
            raise ModelUnavailable("disease model gave an answer that could not be read") from exc

    def classify(self, data: bytes) -> Seen | None:
        image = base64.b64encode(data).decode("ascii")
        screen = self._ask(SCREEN_PROMPT, SCREEN_SCHEMA, image)
        label, seen = screen.get("label"), screen.get("seen")
        if label == HEALTHY:
            return Seen(HEALTHY, None, seen)
        if label != PROBLEM:                                                    # unsure, or a word it made up: not an answer
            return None
        if not self.matches:
            return Seen(PROBLEM, None, seen)
        match = self._ask(MATCH_PROMPT, MATCH_SCHEMA, image)
        best, also = match.get("label"), match.get("also")
        if best not in BY_ID:
            return Seen(PROBLEM, None, seen)
        return Seen(best, None, seen, also if also in BY_ID and also != best else None)


def get_classifier() -> Classifier | None:
    if not settings.ollama_model:
        return None
    return OllamaClassifier(settings.ollama_url, settings.ollama_model, settings.ollama_api_key, matches=settings.photo_matches)
