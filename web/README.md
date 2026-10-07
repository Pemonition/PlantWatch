# PlantWatch dashboard

The Angular front end for PlantWatch: a plant overview with one live card per machine, and a
per-machine detail view with the OEE breakdown and a production chart over a selectable period.

It is built to be left on a screen beside a production line — dark, high contrast, numbers large
enough to read across a bay — and it works down to a 400px-wide phone, because the person who
needs it is often walking.

```bash
docker compose up -d --build          # from the repository root
open http://localhost:8080
```

## What is on the screen

**Plant overview** (`/`). A strip with plant-wide OEE over a rolling fifteen-minute window and
the machine, running and reporting counts; below it a card per machine with OEE as the hero
figure, availability, performance and quality as labelled bars, and a live/stale/no-signal
indicator driven by the age of that machine's last reading. The whole card is a link to its
detail view.

Fifteen minutes, not a shift: this board answers "what is the line doing now", and a press that
stopped four minutes ago has to be visible immediately rather than averaged away behind seven
good hours. Shift-length questions belong on the detail view, where the period is chosen
deliberately.

**Machine detail** (`/machines/:code`). A period selector — last hour, last 8 hours, last 24
hours — which drives the `from`/`to` query on `/oee`; the three factors with the raw counters
they came from (pieces, rejects, run time, planned time); and a stacked column chart of good
versus rejected pieces over the samples the page holds.

**Connection state** is in the header at all times. A live dashboard that silently stops being
live is worse than one that was never live, because the stale numbers still look authoritative.

## Running it

### Against the compose stack

The dashboard container serves the built bundle through nginx, which also proxies `/api`,
`/hubs`, `/health` and `/swagger` to the `api` service. The browser only ever talks to one
origin, so there is no CORS configuration to keep in step with a deployment and no API URL baked
into the bundle. See [ADR 0005](../docs/adr/0005-dashboard-stack-and-delivery.md).

| URL | What |
| --- | --- |
| <http://localhost:8080> | The dashboard |
| <http://localhost:8080/swagger> | Swagger UI, proxied |
| <http://localhost:5080> | The API directly, if you want it without the proxy |

### From source

Requires **Node >= 22.22.3** (Angular 22's floor; it is declared in `package.json` `engines`).

```bash
cd web
npm ci
npm start              # ng serve on http://localhost:4200
```

`ng serve` builds with the `development` configuration, which replaces
`src/environments/environment.ts` with `environment.development.ts`. That file points at
`http://localhost:8080` for both REST and the hub, so it talks to the API published by
`docker compose up -d api` (or `dotnet run --project src/PlantWatch.Api`) cross-origin. The API
already allows `http://localhost:4200` with credentials through its `dashboard` CORS policy, so
no server-side change is needed; `Cors:Origins` is the knob if you serve the dev server from
somewhere else.

| Command | What it does |
| --- | --- |
| `npm start` | Dev server with live reload on :4200 |
| `npm run build` | Production bundle into `dist/plantwatch-web/browser` |
| `npm test` | Unit tests, headless (Vitest on jsdom — no browser is downloaded) |
| `npm run lint` | Prettier in check mode |
| `npm run format` | Prettier, writing |

## How it is put together

```
src/
├── environments/        apiBaseUrl and hubUrl; the production file is relative on purpose
├── styles.css           design tokens — surfaces, status colours, type scale, spacing
└── app/
    ├── core/
    │   ├── models.ts            Machine, Reading, Oee — the wire contract
    │   ├── oee.ts               formatting, OEE bands, liveness. Pure, unit-tested
    │   ├── telemetry-store.ts   live plant state + the pure merge reducer. Unit-tested
    │   ├── api.service.ts       typed HttpClient, one place that knows a URL
    │   ├── realtime.service.ts  the only file that imports @microsoft/signalr
    │   └── clock.ts             a one-second tick, as a signal
    ├── ui/                      presentational components: card, OEE figure, factor bar,
    │                            status dot, connection badge, production chart
    └── features/
        ├── overview/            plant grid
        └── machine-detail/      period selector, breakdown, chart
```

Standalone components throughout — there is no `NgModule` in this project and there should not
be one. All state is signals, and change detection is zoneless: nothing on this page mutates a
plain field and expects a render.

### Realtime

`RealtimeService` owns one `HubConnection`. The overview stays in the server's plant-wide group,
which is where a connection starts; the detail view calls `SubscribeToMachine`, which the server
uses to move the connection out of that group and into a per-machine one, so it stops receiving
the whole plant's traffic. The desired set is reference-counted and replayed after a reconnect,
because the server puts a freshly connected client back into the plant-wide group.

Reconnect uses a capped exponential backoff that **never gives up** — a wall display left running
overnight must come back after an API restart, and SignalR's built-in policy stops after thirty
seconds. An initial connection that never succeeded is retried too, which `withAutomaticReconnect`
does not cover.

### The merge reducer

`mergeReadings` is where the realtime correctness lives, and it is a pure function so it can be
tested without a browser:

- a machine the state has never seen is created (the API auto-registers unknown codes on first
  telemetry, so this is normal);
- a timestamp already held is ignored, which makes the merge idempotent — SignalR redelivers on
  reconnect, MQTT is at-least-once, and the detail view deliberately back-fills over readings the
  stream has already pushed;
- order does not matter. The stream arrives newest-last and `GET /readings` returns newest-first;
  samples are merged and re-sorted, so a back-fill after an hour of streaming fills in history
  rather than being discarded for being old;
- counters accumulate over genuinely new samples only. The MQTT payload carries deltas, not
  lifetime totals ([ADR 0004](../docs/adr/0004-mqtt-topic-and-payload-contract.md)), so the piece
  counts are a sum over what this session observed and reset on reload;
- `lastTimestampMs` and `isRunning` only move forward, so back-filling history cannot make a live
  machine look like it last reported an hour ago.

### Design

The tokens are at the top of `src/styles.css` and nothing outside that file invents a colour or a
spacing value. Three status hues (good / fair / poor) and one accent, used only for status — a
coloured thing on this page always means something.

**Colour is never the only signal.** The OEE band carries a directional glyph and the words
*On target* / *Below target* / *Critical*; liveness carries a distinct shape per state (solid
disc, half disc, struck-through ring) and the words *Live* / *Stale* / *No signal*. Both survive
a monochrome panel and a red-green deficiency.

OEE bands are the thresholds the industry quotes: 85% is "world class", so **75% and above** is
reported on target, **60–75%** below target, **below 60%** critical. Three bands, not five — a
display read at four metres has to be legible, not precise.

Liveness is a function of the last reading's age: **live** under 20 seconds, **stale** to two
minutes, **no signal** beyond. Twenty seconds is four missed samples at the simulator's default
interval, so one late publish does not turn a card amber.

Accessibility: semantic landmarks and one `<h1>`, a skip link, a visible 2px focus ring on every
interactive element, real radio inputs behind the period selector so arrow keys work and the
group is announced as a group, `role="meter"` on the factor bars, and an `aria-live` region on
the connection badge. The chart publishes its numbers as a visually hidden `<table>`.

## Tests

```bash
npm test
```

Vitest on jsdom, headless by construction — no browser is downloaded, nothing needs a display, and
CI runs the same command. Coverage is deliberately narrow and deliberately chosen: the pure
functions where a silent mistake would be expensive.

- `core/oee.spec.ts` — band thresholds at their boundaries, percentage formatting including
  clamping and the non-finite case, and liveness including a machine that has never reported and
  a device clock running slightly fast.
- `core/telemetry-store.spec.ts` — the merge rules above: redelivery, back-fill under a live
  stream, idempotency, mixed batches, ordering, the bounded buffer.
- `core/realtime.spec.ts` — the backoff policy never returns null, so SignalR never stops
  retrying, and the delay is capped.

Components are not unit-tested. Their behaviour is in the pure functions above, and the thing
worth asserting about the rendered page — that three machines appear, their numbers are non-zero
and a value changes while you watch — is an end-to-end check, recorded in
[`docs/verification.md`](../docs/verification.md).

## The API it consumes

### REST

| Method | Endpoint | Used by |
| --- | --- | --- |
| `GET` | `/api/machines` | Overview grid, detail header |
| `GET` | `/api/machines/{code}/oee?from=&to=` | Both views. `from`/`to` are always sent |
| `GET` | `/api/machines/{code}/readings?take=` | Detail chart back-fill. Capped server-side at 500 |
| `GET` | `/health` | nginx proxies it; used by the container health check |

`from` and `to` are always sent explicitly. The server defaults to the last eight hours, which on
a stack that started ten minutes ago reports an availability near zero — arithmetically correct,
and completely misleading on a dashboard. The overview also detects that shape (every machine
reporting, every machine's run time covering little of the window) and says so in a banner rather
than letting a cold start read as a plant on fire.

### Realtime

SignalR hub at `/hubs/telemetry`, client library `@microsoft/signalr`.

- Server-to-client: `reading`, carrying
  `{ machineCode, timestamp, piecesProduced, rejectedPieces, isRunning }`.
- Hub methods: `SubscribeToMachine(code)`, `UnsubscribeFromMachine(code)`. A connection starts in
  the plant-wide stream; subscribing moves it out of that stream into the per-machine one.
  The two are disjoint, so a reading arrives exactly once.

## Known limits

- The piece counters on a card are a sum over what this browser session has observed, not a shift
  total. A reload resets them. The OEE figures, which are the ones that matter, come from the
  server and do not.
- The chart draws the samples the page holds — up to a 500-reading back-fill plus whatever has
  streamed since, which is well under 24 hours of history. On the longer periods the OEE
  breakdown covers the full window but the chart does not, and the view says so.
- No authentication. Neither has the API; it is on the backlog for both.
- One plant, one line. There is no site or area hierarchy, and adding one is a routing and API
  change, not a styling change.
