"""S5: the daily Telegram message with Approve / Skip.

Telegram itself is faked (FakeTelegram) except for two tests of the real HTTP
client against httpx.MockTransport. Database tests use a throwaway Postgres and
skip when none is reachable. No test (and no code path) opens a valve."""
import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pgdb
import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.models.entities import ActionProposal, AuditLog, ProposalStatus
from app.services import daily_message as dm
from app.services.decisions import ZoneDecision
from app.services.rule_engine import Decision
from app.services.seed import seed_stage1
from app.services.telegram import HttpTelegram, TelegramError
from app.workers.mqtt_ingest import store_telemetry
from app.workers.telegram_worker import telegram_enabled

LOCAL = ZoneInfo("Asia/Phnom_Penh")
AT_6 = datetime(2026, 11, 4, 6, 0, tzinfo=LOCAL).astimezone(timezone.utc)
CHAT = "1001"
PLANTED = date(2026, 10, 15)                      # day 21 on 4 Nov


class FakeTelegram:
    """Records what the app would have sent. buttons = rows of (label, callback_data)."""

    def __init__(self):
        self.sent, self.answers, self.edits = [], [], []

    async def send_message(self, chat_id, text, buttons=None):
        self.sent.append((str(chat_id), text, buttons))
        return len(self.sent)

    async def answer_callback(self, callback_id, text):
        self.answers.append((callback_id, text))

    async def edit_message(self, chat_id, message_id, text, buttons=None):
        self.edits.append((str(chat_id), message_id, text))
        self.edit_buttons = buttons


def run_d(zone="zone-a", decision=Decision.IRRIGATE, ms=40_000, reason="auto_threshold", moisture=20.0):
    return ZoneDecision(zone, decision, ms, reason, moisture, AT_6)


# ------------------------------------------------------------ pure: wording

def test_message_lists_every_zone_and_buttons_only_for_runs():
    decisions = [run_d(), run_d("zone-b", Decision.HOLD_IN_RANGE, 0, "within_range", 35.0)]
    text, buttons = dm.compose(decisions, {"zone-a": "pid-1"})
    assert "04 Nov" in text
    assert "zone-a: water 40 s" in text and "zone-b: skip, soil is wet enough" in text
    assert buttons == [[("Approve zone-a", "approve:pid-1"), ("Skip zone-a", "skip:pid-1")]]
    assert "not opened automatically" in text         # honest about what Approve does


def test_message_with_nothing_to_water_has_no_buttons():
    text, buttons = dm.compose([run_d("zone-a", Decision.DEFER_RAIN, 0, "rain_lockout", 10.0)], {})
    assert buttons == [] and "Nothing to water" in text


def test_deciding_one_zone_keeps_the_other_zones_buttons():
    markup = {"inline_keyboard": [
        [{"text": "Approve zone-a", "callback_data": "approve:p1"}, {"text": "Skip zone-a", "callback_data": "skip:p1"}],
        [{"text": "Approve zone-b", "callback_data": "approve:p2"}, {"text": "Skip zone-b", "callback_data": "skip:p2"}]]}
    assert dm.remaining_buttons(markup, "p1") == [[("Approve zone-b", "approve:p2"), ("Skip zone-b", "skip:p2")]]
    assert dm.remaining_buttons(markup, "p2")[0][0][1] == "approve:p1"
    assert dm.remaining_buttons(None, "p1") == []


def test_http_request_logging_cannot_leak_the_token():
    import logging
    import app.main  # noqa: F401  (configures logging)
    # httpx logs every request URL at INFO, and Telegram's URL contains the token
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


def test_next_run_is_today_if_before_the_time_else_tomorrow():
    early = datetime(2026, 11, 4, 5, 0, tzinfo=LOCAL).astimezone(timezone.utc)
    late = datetime(2026, 11, 4, 7, 0, tzinfo=LOCAL).astimezone(timezone.utc)
    assert dm.next_run_at(early, "06:05", "Asia/Phnom_Penh") == \
        datetime(2026, 11, 4, 6, 5, tzinfo=LOCAL).astimezone(timezone.utc)
    assert dm.next_run_at(late, "06:05", "Asia/Phnom_Penh") == \
        datetime(2026, 11, 5, 6, 5, tzinfo=LOCAL).astimezone(timezone.utc)


def test_worker_needs_both_token_and_chat_id():
    assert not telegram_enabled(Settings(telegram_bot_token=None, telegram_chat_id=None))
    assert not telegram_enabled(Settings(telegram_bot_token="123:ABC", telegram_chat_id=""))
    assert telegram_enabled(Settings(telegram_bot_token="123:ABC", telegram_chat_id="1001"))


# ------------------------------------------- real HTTP client, mocked wire

def test_http_client_posts_send_message_with_inline_keyboard():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 55}})

    tg = HttpTelegram("123:ABC", transport=httpx.MockTransport(handler))
    mid = asyncio.run(tg.send_message(1001, "hi", [[("Approve", "approve:x")]]))
    assert mid == 55
    assert seen[0].url.path == "/bot123:ABC/sendMessage"
    body = json.loads(seen[0].content)
    assert body["chat_id"] == 1001 and body["text"] == "hi"
    assert body["reply_markup"] == {"inline_keyboard": [[{"text": "Approve", "callback_data": "approve:x"}]]}


def test_telegram_errors_never_leak_the_bot_token():
    def boom(req):
        raise httpx.ConnectError(f"cannot reach {req.url}")

    tg = HttpTelegram("123:ABC", transport=httpx.MockTransport(boom))
    with pytest.raises(TelegramError) as e:
        asyncio.run(tg.send_message(1001, "hi"))
    assert "123:ABC" not in str(e.value)

    refuse = HttpTelegram("123:ABC", transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"ok": False, "description": "chat not found"})))
    with pytest.raises(TelegramError, match="chat not found"):
        asyncio.run(refuse.send_message(1001, "hi"))


# ------------------------------------------------ integration (Postgres)

def _update(pid, verb="approve", chat=CHAT, user=42, cb="cb1"):
    return {"update_id": 1, "callback_query": {
        "id": cb, "from": {"id": user, "first_name": "Daivai"},
        "message": {"message_id": 7, "chat": {"id": int(chat)}}, "data": f"{verb}:{pid}"}}


def _dry(moisture=20.0):
    return {"device": "ESP-FIELD-01", "sampleCount": 16, "measurements": [
        {"metric": "soil_moisture", "value": moisture, "unit": "pct", "quality": "valid"},
        {"metric": "rain", "value": 0, "unit": "bool", "quality": "valid"}]}


def scenario(db_name):
    """Decorator: seeded tomato farm plus one dry reading for bed A, then the test body."""
    def wrap(fn):
        async def body(Session):
            async with Session() as s:
                await seed_stage1(s, planted_on=PLANTED)
            async with Session() as s:
                await store_telemetry(s, "farm/farm-01/zone/zone-a/telemetry", _dry(), now=AT_6)
            await fn(Session)
        body.__name__ = fn.__name__
        return pgdb.with_db(db_name)(body)
    return wrap


async def _send(Session, tg):
    async with Session() as s:
        return await dm.send_daily_message(s, tg, farm_name="farm-01", chat_id=CHAT, now=AT_6)


@scenario("aaf_s5_send")
async def test_daily_message_creates_a_pending_proposal_and_sends_buttons(Session):
    tg = FakeTelegram()
    ids = await _send(Session, tg)
    assert len(ids) == 1                                   # only zone-a needs water
    chat, text, buttons = tg.sent[0]
    assert chat == CHAT and "Tomato bed A (day 21): water 40 s" in text
    assert "Tomato bed B" not in text                      # the usual bed is never messaged
    assert buttons[0][0][1] == f"approve:{ids[0]}"
    async with Session() as s:
        p = (await s.execute(select(ActionProposal))).scalar_one()
    assert p.status is ProposalStatus.pending and p.duration_ms == 40_000
    assert p.approved_by is None and p.model_version == "rule_engine"
    assert p.expires_at == datetime(2026, 11, 4, 17, 0, tzinfo=LOCAL)      # end of daylight window
    assert "soil_moisture" in p.evidence and json.loads(p.safety_checks)["decision"] == "irrigate"


@scenario("aaf_s5_approve")
async def test_approve_records_the_decision_and_nothing_else(Session):
    tg = FakeTelegram()
    pid = (await _send(Session, tg))[0]
    async with Session() as s:
        out = await dm.handle_update(s, tg, _update(pid), allowed_chat_id=CHAT, now=AT_6)
    assert out == "approved"
    async with Session() as s:
        p = (await s.execute(select(ActionProposal))).scalar_one()
        audit = (await s.execute(select(AuditLog))).scalar_one()
    assert p.status is ProposalStatus.approved and p.approved_by is not None and p.decided_at == AT_6
    assert audit.action == "proposal.approved.tg:42" and audit.entity_id == p.id
    assert "Approved" in tg.edits[0][2] and tg.answers[0][0] == "cb1"


@scenario("aaf_s5_skip")
async def test_skip_rejects_without_naming_an_approver(Session):
    tg = FakeTelegram()
    pid = (await _send(Session, tg))[0]
    async with Session() as s:
        assert await dm.handle_update(s, tg, _update(pid, "skip"), allowed_chat_id=CHAT, now=AT_6) == "rejected"
    async with Session() as s:
        p = (await s.execute(select(ActionProposal))).scalar_one()
    assert p.status is ProposalStatus.rejected and p.approved_by is None
    assert "Skipped" in tg.edits[0][2]


@scenario("aaf_s5_stranger")
async def test_a_press_from_another_chat_changes_nothing(Session):
    tg = FakeTelegram()
    pid = (await _send(Session, tg))[0]
    async with Session() as s:
        out = await dm.handle_update(s, tg, _update(pid, chat="999"), allowed_chat_id=CHAT, now=AT_6)
    assert out == "unauthorised"
    async with Session() as s:
        p = (await s.execute(select(ActionProposal))).scalar_one()
    assert p.status is ProposalStatus.pending and tg.edits == []


@scenario("aaf_s5_twice")
async def test_a_second_press_does_not_flip_the_decision(Session):
    tg = FakeTelegram()
    pid = (await _send(Session, tg))[0]
    async with Session() as s:
        await dm.handle_update(s, tg, _update(pid), allowed_chat_id=CHAT, now=AT_6)
    async with Session() as s:
        out = await dm.handle_update(s, tg, _update(pid, "skip", cb="cb2"), allowed_chat_id=CHAT, now=AT_6)
    assert out == "already_decided"
    async with Session() as s:
        p = (await s.execute(select(ActionProposal))).scalar_one()
    assert p.status is ProposalStatus.approved


@scenario("aaf_s5_expired")
async def test_an_expired_proposal_cannot_be_approved(Session):
    tg = FakeTelegram()
    pid = (await _send(Session, tg))[0]
    late = AT_6 + timedelta(hours=12)                       # 18:00 local, after 17:00
    async with Session() as s:
        out = await dm.handle_update(s, tg, _update(pid), allowed_chat_id=CHAT, now=late)
    assert out == "expired"
    async with Session() as s:
        p = (await s.execute(select(ActionProposal))).scalar_one()
    assert p.status is ProposalStatus.expired and p.approved_by is None
    assert "expired" in tg.answers[0][1].lower()


@scenario("aaf_s5_junk")
async def test_malformed_updates_are_ignored(Session):
    tg = FakeTelegram()
    async with Session() as s:
        assert await dm.handle_update(s, tg, {"update_id": 5}, allowed_chat_id=CHAT, now=AT_6) == "ignored"
        bad = _update("not-a-uuid")
        assert await dm.handle_update(s, tg, bad, allowed_chat_id=CHAT, now=AT_6) == "ignored"
