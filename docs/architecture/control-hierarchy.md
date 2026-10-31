# Control hierarchy

Three tiers decide whether water reaches the bed. They are ordered by authority,
and a lower tier can always stop a higher one — never the reverse.

## Tier 1 — Firmware interlock (ESP8266)

`edge/esp8266-field-node/esp8266_field_node.ino`

Every relay channel has a `MAX_RUN_MS` enforced in the loop. A channel that has
been energised for its limit closes, whatever the server said and whether or not
the server is still alive. This is the only tier that can be trusted when
everything else has failed, which is exactly why it is the simplest.

## Tier 2 — Deterministic rule engine (Raspberry Pi)

`apps/api/app/services/rule_engine.py`

A pure function. No I/O, no model, no network — which is what makes it testable
without hardware (`tests/test_rule_engine.py`). Decision order is fixed:

1. rule disabled → stop
2. rain detected → defer (the grower's own requirement)
3. outside the daylight window → defer (the pump is 6 V solar)
4. moisture above threshold → stop
5. cooldown not elapsed → suppress
6. rain forecast high → defer (advisory only; an unreachable forecast never blocks watering)
7. otherwise → irrigate, for a bounded duration

This tier keeps the bed alive on its own. If the AI layer were deleted tomorrow,
the system would still work.

## Tier 3 — AI assistant (Raspberry Pi)

`apps/api/app/services/assistant.py`

The assistant reads sensor history, device state and irrigation history. It
holds exactly one write tool — `propose_relay_action` — and that tool does not
touch a relay. It writes a row into `action_proposal` and stops.

Every proposal is vetted against the same rule engine that governs autonomous
operation, so the assistant can only ever be as permissive as the deterministic
tier already is. It cannot argue its way past the rain lockout.

A proposal becomes an action only when a named person approves it. The database
enforces attribution:

```sql
CHECK (status <> 'approved' OR approved_by IS NOT NULL)
```

Approved proposals execute through the same bounded actuator path as an
automatic run, so tier 1 still applies.

## Why this arrangement

The interesting property is that **intelligence is added at the top, where it is
safe, and never at the bottom, where it is not.** The assistant can be wrong,
slow, or unavailable without endangering the crop; the firmware limit cannot be
reasoned with. Each tier is simpler and more reliable than the one above it,
which is the correct direction for a system whose failure mode is a flooded bed.
