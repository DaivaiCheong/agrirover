"""
Farm assistant — the AI layer.

Design rule, and the reason this file is short:

    The assistant proposes. A person approves. The rule engine and the firmware
    still bound whatever happens next.

It therefore gets read tools freely, and exactly one write tool — and that write
tool does not touch a relay. It writes a row into action_proposal and stops.
Execution is a separate, human-initiated step in routers/assistant.py.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.services.rule_engine import Decision, RuleConfig, RuleInput, evaluate

PROPOSAL_TTL = timedelta(minutes=15)   # a stale proposal must not be approved later


@dataclass
class SafetyCheck:
    name: str
    passed: bool
    detail: str


@dataclass
class Proposal:
    action: str
    channel: int
    target_state: str
    duration_ms: int
    rationale: str
    evidence: dict
    checks: list[SafetyCheck] = field(default_factory=list)

    @property
    def safe(self) -> bool:
        return all(c.passed for c in self.checks)

    def to_row(self, model_version: str) -> dict:
        return {
            "action": self.action,
            "channel": self.channel,
            "target_state": self.target_state,
            "duration_ms": self.duration_ms,
            "rationale": self.rationale,
            "evidence": json.dumps(self.evidence),
            "safety_checks": json.dumps([c.__dict__ for c in self.checks]),
            "model_version": model_version,
            "expires_at": datetime.now(timezone.utc) + PROPOSAL_TTL,
        }


# --------------------------------------------------------------------------
# Guards. Every proposal is checked against the same deterministic rules that
# govern autonomous operation, so the assistant can never talk its way past
# them — it can only ever be as permissive as the rule engine already is.
# --------------------------------------------------------------------------
def vet(proposal: Proposal, cfg: RuleConfig, sig: RuleInput,
        firmware_limit_ms: int) -> Proposal:
    checks: list[SafetyCheck] = []

    within = proposal.duration_ms <= min(cfg.max_duration_ms, firmware_limit_ms)
    checks.append(SafetyCheck(
        "duration_within_limits", within,
        f"{proposal.duration_ms} ms vs rule {cfg.max_duration_ms} ms / firmware {firmware_limit_ms} ms"))

    verdict = evaluate(cfg, sig)
    agrees = verdict.decision is Decision.IRRIGATE or proposal.target_state == "OFF"
    checks.append(SafetyCheck(
        "rule_engine_agrees", agrees,
        f"rule engine says {verdict.decision.value} ({verdict.reason})"))

    checks.append(SafetyCheck(
        "rain_lockout_respected",
        not (sig.rain_detected and proposal.target_state == "ON" and cfg.rain_lockout),
        "rain sensor wet" if sig.rain_detected else "rain sensor dry"))

    checks.append(SafetyCheck(
        "channel_known", 1 <= proposal.channel <= 4,
        f"channel {proposal.channel}"))

    proposal.checks = checks
    return proposal


# --------------------------------------------------------------------------
# Tool surface exposed to the model. Read tools are unrestricted; there is
# exactly one write tool and it only creates a proposal.
# --------------------------------------------------------------------------
TOOL_SPEC = [
    {"name": "read_sensor_history", "mode": "read",
     "description": "Recent readings for a zone and metric (soil_moisture, water_ph, rain, supply_voltage)."},
    {"name": "read_device_state", "mode": "read",
     "description": "Current relay positions, device liveness and last-seen times."},
    {"name": "read_irrigation_history", "mode": "read",
     "description": "Past irrigation events with their trigger and stop reason."},
    {"name": "propose_relay_action", "mode": "propose",
     "description": "Propose energising or de-energising a relay channel. Creates a proposal for "
                    "human approval. Does NOT actuate anything."},
]

# Deliberately absent: any tool that writes to a relay directly. If a future
# change adds one, this list is the place a reviewer will look first.
BLOCKED_TOOLS = ["set_relay", "open_valve", "run_pump"]

SYSTEM_PROMPT = """You help a small-scale vegetable grower run one irrigated bed.

You may read sensor history, device state and irrigation history freely.

You may NOT operate any equipment. When you believe something should be done,
call propose_relay_action with a clear rationale and the readings that led you
there. A person will read your proposal and decide.

Always state the evidence numerically — the moisture reading, the rain state,
the time of day, and how long since the last irrigation. If the deterministic
rule engine would not act, say so plainly and explain why you disagree rather
than proposing around it.

The pump is 6 V solar and must not run outside daylight. The solenoid is gravity
fed and does not need the battery. Prefer the solenoid when either would work."""
