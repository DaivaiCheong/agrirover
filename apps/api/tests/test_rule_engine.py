from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services.rule_engine import Decision, RuleConfig, RuleInput, evaluate

FARM = ZoneInfo("Asia/Phnom_Penh")
NOON = datetime(2026, 8, 26, 11, 0, tzinfo=FARM)
NIGHT = datetime(2026, 8, 26, 22, 0, tzinfo=FARM)
CFG = RuleConfig()


def _sig(**kw):
    base = dict(moisture_pct=22.0, rain_detected=False, now=NOON, last_event_ended_at=None)
    base.update(kw)
    return RuleInput(**base)


def test_dry_soil_irrigates():
    out = evaluate(CFG, _sig())
    assert out.should_irrigate
    assert out.reason == "auto_threshold"
    assert 0 < out.duration_ms <= CFG.max_duration_ms


def test_rain_beats_dry_soil():
    assert evaluate(CFG, _sig(rain_detected=True)).decision is Decision.DEFER_RAIN


def test_solar_pump_does_not_run_at_night():
    assert evaluate(CFG, _sig(now=NIGHT)).decision is Decision.DEFER_DARK


def test_wet_enough_holds():
    assert evaluate(CFG, _sig(moisture_pct=52.0)).decision is Decision.HOLD_IN_RANGE


def test_cooldown_suppresses():
    out = evaluate(CFG, _sig(last_event_ended_at=NOON - timedelta(minutes=5)))
    assert out.decision is Decision.SUPPRESS_COOLDOWN


def test_duration_never_exceeds_rule_limit():
    out = evaluate(CFG, _sig(moisture_pct=0.0))
    assert out.duration_ms == CFG.max_duration_ms


def test_disabled_rule_never_waters():
    assert not evaluate(RuleConfig(enabled=False), _sig()).should_irrigate


def test_daylight_is_judged_in_farm_time_not_server_time():
    # 11:00 UTC is 18:00 in Phnom Penh — after dark for the solar pump, whatever
    # timezone the server (or its Docker container) happens to run in.
    utc_11 = datetime(2026, 8, 26, 11, 0, tzinfo=timezone.utc)
    assert evaluate(CFG, _sig(now=utc_11)).decision is Decision.DEFER_DARK
    utc_02 = datetime(2026, 8, 26, 2, 0, tzinfo=timezone.utc)      # 09:00 at the farm
    assert evaluate(CFG, _sig(now=utc_02)).should_irrigate
