"""Minimal Telegram Bot API client (httpx, no extra dependency).

Buttons are passed around as rows of (label, callback_data) so the rest of the
app never touches Telegram's JSON shapes. The bot token sits in the request URL,
so errors are rebuilt WITHOUT the original exception text (httpx puts the URL in
it) and chained exceptions are suppressed.
"""
from __future__ import annotations

import httpx

Buttons = list[list[tuple[str, str]]]


class TelegramError(Exception):
    pass


class HttpTelegram:
    def __init__(self, token: str, transport: httpx.AsyncBaseTransport | None = None,
                 base_url: str = "https://api.telegram.org") -> None:
        self._token = token
        self._transport = transport
        self._base = base_url.rstrip("/")

    async def _call(self, method: str, payload: dict, timeout: float = 15.0):
        url = f"{self._base}/bot{self._token}/{method}"
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=timeout) as client:
                resp = await client.post(url, json=payload)
        except httpx.HTTPError as exc:
            raise TelegramError(f"telegram {method} failed: {exc.__class__.__name__}") from None
        try:
            data = resp.json()
        except ValueError:
            raise TelegramError(f"telegram {method}: HTTP {resp.status_code}, not JSON") from None
        if not data.get("ok"):
            raise TelegramError(f"telegram {method}: {data.get('description', resp.status_code)}")
        return data.get("result")

    @staticmethod
    def _markup(buttons: Buttons | None) -> dict | None:
        if not buttons:
            return None
        return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in buttons]}

    async def send_message(self, chat_id, text: str, buttons: Buttons | None = None) -> int:
        payload = {"chat_id": chat_id, "text": text}
        if (markup := self._markup(buttons)):
            payload["reply_markup"] = markup
        return (await self._call("sendMessage", payload))["message_id"]

    async def answer_callback(self, callback_id: str, text: str) -> None:
        await self._call("answerCallbackQuery", {"callback_query_id": callback_id, "text": text})

    async def edit_message(self, chat_id, message_id: int, text: str, buttons: Buttons | None = None) -> None:
        payload = {"chat_id": chat_id, "message_id": message_id, "text": text}
        if (markup := self._markup(buttons)):
            payload["reply_markup"] = markup        # omitted -> Telegram removes the keyboard
        await self._call("editMessageText", payload)

    async def get_updates(self, offset: int | None, timeout: int = 25) -> list[dict]:
        payload: dict = {"timeout": timeout, "allowed_updates": ["callback_query"]}
        if offset is not None:
            payload["offset"] = offset
        return await self._call("getUpdates", payload, timeout=timeout + 10) or []
