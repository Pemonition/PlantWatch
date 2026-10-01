# PlantWatch dashboard (phase 2 — not built yet)

This directory is a placeholder. There is no Angular application here yet, and this file says
so rather than implying otherwise.

## What is planned

An Angular single-page application that shows, for one small factory:

- A plant overview: every machine as a tile with its current state and today's OEE.
- A machine detail view: the three OEE factors over a selectable period, a production chart,
  and the stop timeline.
- Live updates, so a tile turning red does not wait for a page refresh.

## Why it is a separate phase

The back end is the part of this project that carries the engineering weight, and it is finished
and testable on its own: the API is browsable through Swagger and the simulator provides real
data without hardware. Shipping a half-built dashboard alongside it would make both harder to
review. The dashboard also wants a design pass more than it wants code, and that is a different
kind of work.

## The API it will consume

The server side is already in place. Everything below exists and is reachable today.

### REST

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/machines` | Populates the plant overview: code, name, ideal cycle time. |
| `GET` | `/api/machines/{code}/oee?from=&to=` | The three factors plus OEE, with the raw counters, for the machine detail view. Defaults to the last 8 hours. |
| `GET` | `/api/machines/{code}/readings?take=` | Recent samples for the production chart, newest first. Capped server-side at 500. |
| `GET` | `/health` | Used by the shell to show a backend-unreachable state instead of empty tiles. |

### Realtime

SignalR hub at `/hubs/telemetry`.

- Server-to-client event: `reading`, carrying
  `{ machineCode, timestamp, piecesProduced, rejectedPieces, isRunning }`.
- Hub methods: `SubscribeToMachine(machineCode)` and `UnsubscribeFromMachine(machineCode)`.
  A connection starts in the plant-wide stream, which is what the overview wants. The detail
  view calls `SubscribeToMachine`, which moves the connection out of that stream and into the
  per-machine one, so it does not receive the whole plant's traffic. Unsubscribing from the last
  machine puts it back. The two streams are disjoint: a reading arrives once, never twice.

Client library: `@microsoft/signalr`.

### CORS

The API ships a named `dashboard` policy that already allows `http://localhost:4200` with
credentials, configurable through `Cors:Origins`. No API change is needed to start development.

## Intended shape

- Angular with standalone components and the `inject()` function.
- Signals for component state; the SignalR connection wrapped in a single service that exposes
  an observable stream, so no component talks to the transport directly.
- Typed API clients generated from the OpenAPI document the API already publishes, rather than
  hand-written interfaces that can drift from the server.
- Served in production as static files behind the same origin as the API, which removes the CORS
  concern entirely.
