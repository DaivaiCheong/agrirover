"""The daily Telegram message and the Approve / Skip answer.

The rule engine decides (see services/decisions.py). This module only reports
the decision to a human and records their answer. Approving writes an
ActionProposal status; it does NOT open a valve. The farmer acts, and
automation comes later, once the decisions are trusted.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (ActionProposal, AuditLog, Device, DeviceKind, Farm,
                                 ProposalStatus, Zone)
from app.services.decisions import ZoneDecision, decisions_for_farm
from app.services.rule_engine import Decision, utcnow
from app.services.telegram import Buttons

EXPIRY_HOUR_LOCAL = 17           # a morning plan is void once the daylight window closes
FARM_TZ_DEFAULT = "Asia/Phnom_Penh"
MODEL_VERSION = "rule_engine"    # the proposer is the deterministic engine, not an AI model


# ------------------------------------------------------------------ wording

def compose(decisions: list[ZoneDecision], proposal_ids: dict[str, str],
            farm_tz: str = FARM_TZ_DEFAULT) -> tuple[str, Buttons]:
    if not decisions:
        return "AgriRover: no zones are configured.", []
    day = decisions[0].decision_at.astimezone(ZoneInfo(farm_tz)).strftime("%a %d %b")
    lines = [f"AgriRover · {day}"]
    for d in decisions:
        soil = f" · soil {d.moisture_pct:.0f}%" if d.moisture_pct is not None else ""
        lines.append(f"{d.text}{soil}")
    buttons: Buttons = []
    for d in decisions:
        if d.zone in proposal_ids:
            pid = proposal_ids[d.zone]
            buttons.append([(f"Approve {d.zone}", f"approve:{pid}"), (f"Skip {d.zone}", f"skip:{pid}")])
    lines.append("")
    lines.append("Approve logs your OK; the valve is not opened automatically." if buttons
                 else "Nothing to water today.")
    return "\n".join(lines), buttons


def remaining_buttons(markup: dict | None, decided_id: str) -> Buttons:
    """The keyboard Telegram attached to the message, minus the row of the decided proposal."""
    rows: Buttons = []
    for row in (markup or {}).get("inline_keyboard", []):
        if any(str(b.get("callback_data", "")).endswith(f":{decided_id}") for b in row):
            continue
        rows.append([(b["text"], b["callback_data"]) for b in row])
    return rows


def next_run_at(now: datetime, hhmm: str, farm_tz: str) -> datetime:
    """Next occurrence of HH:MM farm-local strictly after `now`, as aware UTC."""
    hour, minute = (int(x) for x in hhmm.split(":"))
    tz = ZoneInfo(farm_tz)
    local = now.astimezone(tz)
    at = datetime.combine(local.date(), time(hour, minute), tzinfo=tz)
    if at <= local:
        at = datetime.combine(local.date() + timedelta(days=1), time(hour, minute), tzinfo=tz)
    return at.astimezone(timezone.utc)


# ------------------------------------------------------------------ sending

async def send_daily_message(session: AsyncSession, tg, *, farm_name: str, chat_id,
                             now: datetime | None = None) -> list[str]:
    """Take today's decisions, create a pending proposal per zone to be watered,
    send one message. Returns the new proposal ids. If sending fails nothing is
    committed, so no proposal exists that the farmer was never shown."""
    decisions = await decisions_for_farm(session, farm_name, now)
    farm = (await session.execute(select(Farm).where(Farm.name == farm_name))).scalar_one_or_none()
    if farm is None:
        return []
    tz = ZoneInfo(farm.timezone)
    zones = {z.name: z for z in (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id))).scalars()}
    device = (await session.execute(select(Device).where(
        Device.farm_id == farm.id, Device.kind == DeviceKind.field_node))).scalars().first()

    proposal_ids: dict[str, str] = {}
    for d in decisions:
        if d.decision is not Decision.IRRIGATE:
            continue
        expires = datetime.combine(d.decision_at.astimezone(tz).date(), time(EXPIRY_HOUR_LOCAL), tzinfo=tz)
        p = ActionProposal(
            zone_id=zones[d.zone].id, device_id=device.id if device else None,
            action="set_relay", channel=1, target_state="ON", duration_ms=d.duration_ms,
            rationale=d.text,
            evidence=f"soil_moisture={d.moisture_pct}% (newest reading) for decision at {d.decision_at.isoformat()}",
            safety_checks=json.dumps({"decision": d.decision.value, "reason": d.reason,
                                      "duration_ms": d.duration_ms}),
            model_version=MODEL_VERSION, expires_at=expires)
        session.add(p)
        await session.flush()                       # assigns the id used in the buttons
        proposal_ids[d.zone] = str(p.id)

    text, buttons = compose(decisions, proposal_ids, farm.timezone)
    await tg.send_message(chat_id, text, buttons)   # raises -> nothing committed
    await session.commit()
    return list(proposal_ids.values())


# ----------------------------------------------------------- button presses

async def handle_update(session: AsyncSession, tg, update: dict, *, allowed_chat_id,
                        now: datetime | None = None) -> str:
    """Handle one Telegram update. Returns what happened (for logs and tests):
    approved | rejected | expired | already_decided | unauthorised | ignored."""
    cq = update.get("callback_query")
    if not isinstance(cq, dict):
        return "ignored"
    verb, _, raw_id = str(cq.get("data", "")).partition(":")
    try:
        pid = uuid.UUID(raw_id)
    except ValueError:
        return "ignored"
    if verb not in ("approve", "skip"):
        return "ignored"

    message = cq.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    cb_id = cq.get("id", "")
    if str(chat_id) != str(allowed_chat_id):
        await tg.answer_callback(cb_id, "Not authorised.")
        return "unauthorised"

    proposal = await session.get(ActionProposal, pid)
    if proposal is None:
        await tg.answer_callback(cb_id, "Unknown request.")
        return "ignored"
    if proposal.status is not ProposalStatus.pending:
        await tg.answer_callback(cb_id, f"Already {proposal.status.value}.")
        return "already_decided"

    now = now or utcnow()
    if proposal.expires_at is not None and now > proposal.expires_at:
        proposal.status = ProposalStatus.expired
        await session.commit()
        await tg.answer_callback(cb_id, "This request has expired.")
        return "expired"

    zone = await session.get(Zone, proposal.zone_id)
    farm = await session.get(Farm, zone.farm_id)
    user = cq.get("from") or {}
    who = user.get("first_name") or user.get("username") or str(user.get("id", "?"))

    if verb == "approve":
        proposal.status = ProposalStatus.approved
        proposal.approved_by = farm.owner_id          # the farm's responsible person; the chat is the proof
        outcome, note = "approved", f"Approved by {who}: {zone.name}, {round((proposal.duration_ms or 0) / 1000)} s"
    else:
        proposal.status = ProposalStatus.rejected
        outcome, note = "rejected", f"Skipped by {who}: {zone.name}"
    proposal.decided_at = now
    session.add(AuditLog(user_id=farm.owner_id, action=f"proposal.{outcome}.tg:{user.get('id', '?')}",
                         entity_type="action_proposal", entity_id=proposal.id))
    await session.commit()

    await tg.answer_callback(cb_id, note)
    await tg.edit_message(chat_id, message.get("message_id"),
                          f"{message.get('text', '')}\n\n{note}".strip(),
                          remaining_buttons(message.get("reply_markup"), str(proposal.id)))
    return outcome
