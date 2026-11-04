from datetime import date, datetime
from zoneinfo import ZoneInfo


def farm_today() -> date:
    """Today's date in Cambodia, not the server's (the API runs in Docker, which is UTC)."""
    return datetime.now(ZoneInfo("Asia/Phnom_Penh")).date()
