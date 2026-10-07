# 4. MQTT topic structure and payload contract

- Status: accepted
- Date: 2026-10-01

## Context

Telemetry arrives from devices on the plant floor: PLCs, ESP32 gateways, industrial PCs. Once
a device is commissioned and sealed in a cabinet, its firmware is expensive to change — a
server-side refactor cannot be allowed to require a site visit.

Two things must therefore be decided deliberately rather than by accident: the topic
structure, and the payload shape.

For topics, the options were a flat `plantwatch/telemetry` with the machine identified in the
body, or a hierarchical topic carrying the machine identity. A flat topic makes a single
subscription trivial but makes per-machine authorisation impossible, because MQTT ACLs operate
on topics and not on payload contents.

For payloads, the choice was between cumulative counters (lifetime piece count) and per-sample
deltas (pieces since the last sample). Cumulative counters survive a dropped message but reset
to zero on a controller reboot, which reads as a large negative delta — a failure mode that
corrupts history silently.

## Decision

**Topic:** `plantwatch/{machineCode}/telemetry`

The server subscribes to `plantwatch/+/telemetry`. The machine code in the topic is
authoritative; when it disagrees with `machineCode` in the body, the topic wins. A device
publishing on its own topic therefore cannot write telemetry attributed to another machine.

**Payload:** UTF-8 JSON, camelCase, with per-sample deltas.

```json
{
  "machineCode": "PRESS-01",
  "timestamp": "2026-10-01T12:00:05Z",
  "piecesProduced": 4,
  "rejectedPieces": 1,
  "isRunning": true
}
```

- `piecesProduced` and `rejectedPieces` are counts **since the previous sample**, not totals.
- `rejectedPieces` is a subset of `piecesProduced`; the server clamps it if a device gets this
  wrong.
- `timestamp` is the sample instant and should carry a UTC offset. The server substitutes its
  own clock when the field is absent, and never silently reinterprets a local time as UTC.
- Unknown fields are ignored, so a device may add fields without breaking ingestion.

The contract is represented by its own type (`TelemetryMessage`) rather than by the domain
entity, and the simulator deliberately declares its own copy instead of referencing the
server's — hardware does not share types with the server it talks to.

## Consequences

- Per-machine authorisation and per-machine subscriptions are possible without parsing
  payloads, because the identity is in the topic.
- A dashboard, a debugging `mosquitto_sub`, or a future second consumer can filter by machine
  at the broker.
- Deltas mean a lost message loses exactly that interval's pieces and nothing more: errors do
  not accumulate, and a controller reboot cannot rewrite history.
- Deltas also mean the system has no independent cross-check on the total. A persistently
  under-reporting device will understate production with nothing to contradict it. Mitigation,
  when it matters, is a periodic cumulative reading reconciled against the sum.
- JSON costs bandwidth against a binary encoding such as Protobuf or CBOR. At one small
  message every few seconds per machine this is irrelevant, and being able to read telemetry
  with `mosquitto_sub` during commissioning is worth far more than the bytes.
- Because `TelemetryMessage` is a published contract with field hardware, changing a field name
  or its meaning is a breaking change requiring a new topic suffix (for example
  `telemetry/v2`), not an edit.
