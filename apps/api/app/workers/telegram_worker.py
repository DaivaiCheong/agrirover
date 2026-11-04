"""Telegram worker: sends the daily message and listens for Approve / Skip.

Long polling (getUpdates), not a webhook: the farm server sits behind a home or
mobile connection with no public address. Off unless both TELEGRAM_BOT_TOKEN and
TELEGRAM_CHAT_ID are set.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from app.core.config import Settings, settings
from app.core.db import SessionLocal
from app.services.daily_message import FARM_TZ_DEFAULT, handle_update, next_run_at, send_daily_message
from app.services.telegram import HttpTelegram

log = logging.getLogger("telegram")


def telegram_enabled(s: Settings = settings) -> bool:
    return bool(s.telegram_bot_token and s.telegram_chat_id)


async def _daily_loop(tg: HttpTelegram) -> None:
    while True:
        now = datetime.now(timezone.utc)
        at = next_run_at(now, settings.daily_message_time, FARM_TZ_DEFAULT)
        await asyncio.sleep(max(0.0, (at - now).total_seconds()))
        try:
            async with SessionLocal() as session:
                ids = await send_daily_message(session, tg, farm_name=settings.farm_name,
                                               chat_id=settings.telegram_chat_id)
            log.info("daily message sent, %d zone(s) awaiting approval", len(ids))
        except Exception as exc:                          # noqa: BLE001 — try again tomorrow
            log.error("daily message failed: %s", exc)
        await asyncio.sleep(61)                           # never fire twice in the same minute


async def _poll_loop(tg: HttpTelegram) -> None:
    offset: int | None = None
    while True:
        try:
            for update in await tg.get_updates(offset):
                offset = update["update_id"] + 1
                async with SessionLocal() as session:
                    outcome = await handle_update(session, tg, update,
                                                  allowed_chat_id=settings.telegram_chat_id)
                log.info("telegram update -> %s", outcome)
        except asyncio.CancelledError:
            raise
        except Exception as exc:                          # noqa: BLE001
            log.warning("telegram poll error (%s); retrying in 5 s", exc)
            await asyncio.sleep(5)


@contextlib.asynccontextmanager
async def telegram_lifespan() -> AsyncIterator[None]:
    if not telegram_enabled():
        log.info("telegram off (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable)")
        yield
        return
    tg = HttpTelegram(settings.telegram_bot_token)
    tasks = [asyncio.create_task(_daily_loop(tg)), asyncio.create_task(_poll_loop(tg))]
    log.info("telegram on: daily message at %s", settings.daily_message_time)
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await t
