# End-to-end verification

The unit tests prove the OEE arithmetic. They prove nothing about whether the stack starts,
whether the migration reaches a real Postgres, or whether a message published to the broker ends
up in a table. This file records the first run that checked all of that, so the claim "it runs"
can be audited rather than taken on trust.

Run on 2026-10-01, Linux x86-64, Docker 29.4.3, Docker Compose v5.1.3, .NET SDK 9.0.
Every command below was run from the repository root against a volume wiped with
`docker compose down -v` first. Output is quoted verbatim, trimmed only where noted.

## 1. The stack comes up and stays up

```
$ docker compose up -d --build
...
 Container plantwatch-mosquitto  Healthy
 Container plantwatch-postgres   Healthy
 Container plantwatch-api        Started
 Container plantwatch-simulator  Started
```

Started 08:05:18Z. Checked again at 08:13:00Z, just under eight minutes later:

```
$ docker inspect --format '{{.Name}} restarts={{.RestartCount}} health=...' <each container>
/plantwatch-mosquitto  restarts=0 health=healthy  running=true
/plantwatch-postgres   restarts=0 health=healthy  running=true
/plantwatch-api        restarts=0 health=healthy  running=true
/plantwatch-simulator  restarts=0 health=n/a      running=true
```

`restarts=0` on all four is the part that matters: nothing crash-looped. The simulator reports
`health=n/a` because it has no health check — it listens on no port, so there is nothing to
probe; `running=true` is the whole claim being made about it.

The API reported `health=starting` forever on the first attempt. The check shelled out to
`wget`, and the `mcr.microsoft.com/dotnet/aspnet:9.0` image ships no HTTP client at all:

```
$ docker inspect plantwatch-api --format '{{json .State.Health}}'
{"Status":"starting","FailingStreak":4,"Log":[{"ExitCode":1,"Output":"/bin/sh: 1: wget: not found\n"},...]}
```

The endpoint itself was answering `200` the entire time — only the probe was broken. Fixed by
installing `curl` in the runtime stage of the API Dockerfile and calling it from the check.

## 2. The migration is applied against the real Postgres

```
$ docker exec plantwatch-postgres psql -U plantwatch -d plantwatch -c '\dt'
 Schema |         Name          | Type  |   Owner
--------+-----------------------+-------+------------
 public | __EFMigrationsHistory | table | plantwatch
 public | machines              | table | plantwatch
 public | sensor_readings       | table | plantwatch
 public | stop_events           | table | plantwatch

$ ... -c 'select * from "__EFMigrationsHistory";'
         MigrationId          | ProductVersion
------------------------------+----------------
 20261001063843_InitialCreate | 9.0.20

$ ... -c 'select "Code","Name","IdealCycleSeconds" from machines order by "Code";'
   Code   |        Name        | IdealCycleSeconds
----------+--------------------+-------------------
 LATHE-02 | CNC lathe 02       |                30
 PACK-03  | Packaging line 03  |                 4
 PRESS-01 | Hydraulic press 01 |                12
```

The three demo machines are the seed in `Program.cs`, so both the migration and the seeding ran.

## 3. Telemetry reaches the table

`sensor_readings` sampled three times, fifteen seconds apart:

```
08:11:13Z count=207
08:11:28Z count=216
08:11:43Z count=225
```

Nine rows per fifteen seconds is three machines on a five-second interval, which is exactly what
the simulator is configured to publish. At 08:13:00Z the count was 271.

Auto-registration of a machine nobody seeded, published by hand to the broker:

```
$ docker exec plantwatch-mosquitto mosquitto_pub -h localhost \
    -t 'plantwatch/WELD-07/telemetry' \
    -m '{"machineCode":"WELD-07","timestamp":"2026-10-01T08:12:14Z","piecesProduced":5,"rejectedPieces":1,"isRunning":true}'

$ curl -sS http://localhost:8080/api/machines
[..., {"code":"WELD-07","name":"WELD-07","idealCycleSeconds":30}]
```

A malformed payload on the same topic (`not json at all`) was discarded without taking ingestion
or the host down — `/health` still answered `200` afterwards and the row count kept climbing.

## 4. The REST surface answers

```
$ curl -o /dev/null -w '%{http_code}' http://localhost:8080/health
200

$ curl http://localhost:8080/api/machines
[{"code":"LATHE-02","name":"CNC lathe 02","idealCycleSeconds":30},
 {"code":"PACK-03","name":"Packaging line 03","idealCycleSeconds":4},
 {"code":"PRESS-01","name":"Hydraulic press 01","idealCycleSeconds":12}]

$ curl "http://localhost:8080/api/machines/UNKNOWN-99/oee"
{"message":"Unknown machine code 'UNKNOWN-99'."}        # 404

$ curl "http://localhost:8080/api/machines/PRESS-01/readings?take=3"
[{"machineCode":"PRESS-01","timestamp":"2026-10-01T08:12:05.33602+00:00","piecesProduced":0,...},
 {"machineCode":"PRESS-01","timestamp":"2026-10-01T08:12:00.337892+00:00","piecesProduced":0,...},
 {"machineCode":"PRESS-01","timestamp":"2026-10-01T08:11:55.336127+00:00","piecesProduced":1,...}]
```

OEE over the five minutes the stack had actually been running
(`?from=2026-10-01T08:07:06Z&to=2026-10-01T08:12:06Z`):

| Machine | Availability | Performance | Quality | OEE | Pieces | Rejects |
| --- | --- | --- | --- | --- | --- | --- |
| PRESS-01 | 0.936 | 0.898 | 1.000 | 0.840 | 21 | 0 |
| LATHE-02 | 0.833 | 0.840 | 0.857 | 0.600 | 7 | 1 |
| PACK-03 | 0.919 | 0.943 | 0.985 | 0.853 | 65 | 1 |

Those are plausible numbers for the simulated duty cycles: `PACK-03` has the shortest cycle and
the lowest stop probability and produces the most, `LATHE-02` stops most often and shows it in
availability. Every factor is inside `[0, 1]`, and no factor is zero.

**The first run of this table was all zeros for PRESS-01 and LATHE-02**, and that turned out to
be a real defect rather than a reporting window problem:

```
{"machineCode":"PRESS-01","availability":0.0017,"performance":0,"quality":0,"oee":0,"totalPieces":0,...}
```

`SimulatedMachine.NextSample` computed pieces as `Math.Round(interval / idealCycle × efficiency)`.
At the default five-second interval that is 0.42 pieces for a twelve-second press and 0.17 for a
thirty-second lathe — both round to zero, on every sample, forever. The two slowest machines
reported permanent zero production, which drove performance and quality to zero and made the
headline number of the whole project meaningless. Fixed by carrying the fractional remainder
between samples, so a piece is reported on the sample where it would really have come off.

Note the default window. `/oee` with no `from`/`to` covers the last eight hours, so a stack that
has been up for five minutes returns `availability ≈ 0.0017` — five minutes of run time against
eight hours of planned time. The arithmetic is right and the reading is useless; the README now
says so and shows how to pass a window.

## 5. The SignalR hub accepts a connection and pushes

A Node client (`@microsoft/signalr`), WebSocket transport, `skipNegotiation`:

```
[08:07:14.708Z] connected, transport=WebSockets, connectionId=...
[08:07:14.716Z] SubscribeToMachine('PRESS-01') ack
[08:07:15.324Z] reading #1: {"machineCode":"PRESS-01","timestamp":"2026-10-01T08:07:15.31+00:00","piecesProduced":0,"rejectedPieces":0,"isRunning":true}
[08:07:20.327Z] reading #2: {"machineCode":"PRESS-01","timestamp":"2026-10-01T08:07:20.31+00:00","piecesProduced":1,"rejectedPieces":0,"isRunning":true}
[08:07:25.315Z] reading #3: {"machineCode":"PRESS-01","timestamp":"2026-10-01T08:07:25.31+00:00","piecesProduced":0,"rejectedPieces":0,"isRunning":true}
```

Connection accepted, hub method invoked and acknowledged, three readings pushed at the five-second
publish interval, all for the subscribed machine.

The same probe against the original code showed the bug this exposed:

```
[08:04:14.512Z] reading #1: {"machineCode":"PRESS-01",...}
[08:04:14.513Z] reading #2: {"machineCode":"PRESS-01",...}      <- same reading, twice
[08:04:14.514Z] reading #3: {"machineCode":"LATHE-02",...}      <- not subscribed to
```

The broadcaster sent every reading to `Clients.All` *and* to the per-machine group. `Clients.All`
is a superset of every group, so a subscribed client received its own machine's readings twice and
the rest of the plant's anyway — the opposite of what `SubscribeToMachine` is documented to do.
Fixed by giving the plant-wide audience its own group, so the two audiences are disjoint.

## Changes this verification forced

| File | Why |
| --- | --- |
| `src/PlantWatch.Api/Dockerfile` | Install `curl` in the runtime stage; the ASP.NET image has no HTTP client for the health check to use. |
| `docker-compose.yml` | API health check calls `curl` instead of the absent `wget`. |
| `tools/PlantWatch.Simulator/SimulatedMachine.cs` | Carry the fractional piece count between samples instead of rounding it to zero. |
| `src/PlantWatch.Api/Realtime/TelemetryHub.cs` | Explicit group for the plant-wide stream, so subscribing actually narrows and nothing is delivered twice. |
| `src/PlantWatch.Api/Realtime/SignalRTelemetryBroadcaster.cs` | Broadcast to that group rather than `Clients.All`. |
| `src/PlantWatch.Infrastructure/DependencyInjection.cs` | `EnableRetryOnFailure` on Npgsql, so a transient database failure does not take the host down mid-migration or drop a sample. |
| `README.md`, `web/README.md` | Describe the hub and the default OEE window as they actually behave. |

## Build and tests afterwards

```
$ dotnet build
Build succeeded.  0 Warning(s)  0 Error(s)

$ dotnet test
Passed! - Failed: 0, Passed: 13, Skipped: 0, Total: 13
```

## Not verified

- **The retry policy was not exercised.** `EnableRetryOnFailure` is reasoning about a failure
  mode, not something this run reproduced; killing Postgres under load and watching the API
  survive would be the real test.
- **Concurrent auto-registration.** Two readings for the same unknown machine arriving close
  enough together would race on the unique index on `machines.Code`; one would lose, the
  exception would be swallowed by the ingestion handler, and that reading would be dropped. Not
  reachable with the simulator, which publishes three distinct known codes.
- **Restart behaviour across a reboot of the broker or the database** — `restart: unless-stopped`
  is configured but was never triggered.
- **Long-run behaviour.** The longest observation here is about eight minutes. Nothing is known
  about table growth, index bloat or memory over days.

---

# Phase 2 — the dashboard, end to end

The section above verified that telemetry reaches a table and that the API answers. It says
nothing about whether a browser can render any of it. This section records the first run that
checked the dashboard itself: served from its own container, against the real stack, driven by a
headless browser rather than by reading the code and assuming.

Run on 2026-10-01, Linux x86-64, Docker 29.4.3, Docker Compose v5.1.3, .NET SDK 9.0, Node
22.22.3, Angular 22.2. Every command was run from the repository root after
`docker compose down -v`, so the database, the volume and the images all started from nothing.

## 1. The dashboard builds and its tests pass

```
$ cd web && rm -rf node_modules dist .angular && npm ci
added 285 packages ... found 0 vulnerabilities

$ npm run lint
Checking formatting...
All matched files use Prettier code style!

$ npm test
 Test Files  3 passed (3)
      Tests  35 passed (35)
   Duration  1.41s

$ npm run build
Initial chunk files   | Names          |  Raw size | Estimated transfer size
main-....js           | main           | 327.48 kB |                87.30 kB
styles-....css        | styles         |   2.38 kB |               947 bytes
                      | Initial total  | 329.86 kB |                88.24 kB
Lazy chunk files      | machine-detail |  16.39 kB |                 4.77 kB
                      | overview       |  10.41 kB |                 3.13 kB
Application bundle generation complete.
```

The tests run on Vitest against jsdom. Nothing downloads a browser and nothing needs a display,
so "headless" is a property of the setup rather than a flag that can be forgotten in CI.

## 2. The whole stack comes up, including the dashboard

```
$ docker compose down -v && docker compose up -d --build
 Container plantwatch-mosquitto  Healthy
 Container plantwatch-postgres   Healthy
 Container plantwatch-api        Healthy
 Container plantwatch-simulator  Started
 Container plantwatch-web        Started
```

Sixteen minutes later:

```
$ docker compose ps
plantwatch-api        Up 14 minutes (healthy)
plantwatch-mosquitto  Up 16 minutes (healthy)
plantwatch-postgres   Up 16 minutes (healthy)
plantwatch-simulator  Up 16 minutes
plantwatch-web        Up 14 minutes (healthy)

$ docker inspect --format '{{.Name}} restarts={{.RestartCount}}' <each>
/plantwatch-api restarts=0   /plantwatch-web restarts=0   /plantwatch-postgres restarts=0
/plantwatch-mosquitto restarts=0   /plantwatch-simulator restarts=0
```

Everything on one port, through the nginx proxy in the web container:

```
$ for u in / /api/machines /health /swagger/index.html; do curl -o /dev/null -w "$u %{http_code}\n" http://localhost:8080$u; done
/                    200
/api/machines        200
/health              200
/swagger/index.html  200
```

The WebSocket upgrade is the part a proxy usually breaks, so it was confirmed from nginx's own
log rather than inferred from the page working:

```
$ docker compose logs web | grep hubs
"POST /hubs/telemetry/negotiate?negotiateVersion=1 HTTP/1.1" 200 316
"GET /hubs/telemetry?id=L0XTW-oabvqzNijSV19c0g HTTP/1.1" 101 538
```

`101 Switching Protocols`, not a 200 long-poll: the `Upgrade`/`Connection` forwarding in
`web/nginx.conf` is doing its job. Without it the hub still works, by silently falling back to
long polling — which is exactly why this was checked rather than assumed.

## 3. A headless browser drives the real page

Playwright/Chromium against `http://localhost:8080`, no mocks, with the simulator publishing.
Fifteen assertions, all passing:

```
PASS  three machine cards render — found 3
PASS  expected machine codes present — LATHE-02, PACK-03, PRESS-01
PASS  every machine OEE is a non-zero number — 67, 84, 80
PASS  SignalR connection reports live — LIVE FEED
PASS  all machines report as live — Live, Live, Live
PASS  readings arrive over the WebSocket while the page is open — 9 hub frames in 16s
PASS  no machine ever went stale during the watch (continuous delivery) — worst observed age 4s
PASS  the rendered cards visibly changed during the watch — card text differs before/after
PASS  detail view shows an OEE figure — 19
PASS  production chart draws columns from the REST back-fill — 25 rects
PASS  chart grows on the per-machine subscription (pieces counted rise) — 23 -> 24 good pieces
PASS  period selector requests a new from/to window
      — /api/machines/LATHE-02/oee?from=2026-10-01T02:18:14Z&to=2026-10-01T10:18:14Z
PASS  detail view has no horizontal overflow at 420px
PASS  overview has no horizontal overflow at 420px
PASS  no console or page errors
```

The realtime claim is deliberately asserted three ways, because "the page looks live" is the
easiest thing in a dashboard to believe without evidence. Frames are counted off the WebSocket
itself (nine `reading` frames in sixteen seconds — three machines on a five-second interval);
the worst last-reading age observed across sixteen one-second samples was four seconds, so
delivery was continuous rather than bursty; and the rendered card text differs before and after.
On the detail view, the chart's piece total rises while the page is open, which exercises the
per-machine subscription rather than the plant-wide one.

The corresponding OEE from the API over the same window, for comparison with what the page
showed:

```
$ curl "http://localhost:8080/api/machines/PACK-03/oee?from=...&to=..."
{"availability":0.925,"performance":0.922,"quality":0.990,"oee":0.844,
 "totalPieces":192,"rejectedPieces":2,"runTimeMinutes":13.88,"plannedTimeMinutes":15}
```

## 4. The screenshots were looked at, not just taken

`docs/screenshots/` holds the overview and the detail view at 1280px and at 420px. Each was
opened and read, and three things were wrong in the first pass and were fixed rather than
shipped:

| What the screenshot showed | Cause | Fix |
| --- | --- | --- |
| The detail view's production chart had a single column spanning the whole plot, over an eight-second span. | The live store's reducer dropped any reading older than the newest it held. By the time the detail view opened, the overview had been streaming for minutes, so the entire `GET /readings` back-fill was older than the newest sample and was discarded wholesale. | Replaced the append-only rule with an order-insensitive merge that de-duplicates by timestamp and re-sorts. Back-fill now fills in history underneath the live stream. Four new unit tests pin it. |
| A horizontal scrollbar at 420px on the detail view — the page was 586px wide inside a 420px viewport. | The chart's visually hidden `<table>` carried the `.pw-sr-only` class directly, and a table ignores `width: 1px` when its content is wider, so it laid out at full width and pushed the page out. | Wrapped the table in a clipping `<div class="pw-sr-only">`. The div has no such behaviour. |
| Every machine reading 10–17% and "Critical" two minutes after start-up. | Correct arithmetic: availability is run time over the *requested* window, and a stack up for two minutes has two minutes of run time against a fifteen-minute window. Nothing on the page said so. | Both views now detect that shape — every machine reporting, run time covering under 60% of the window — and say it in a banner. The detail view shows the same note per machine. |

A fourth, smaller one: the banner's copy said "every machine is running" while the condition had
been relaxed to "every machine is reporting", and a screenshot caught it saying so above a card
reading *Stopped*.

The overview at 1280px is the demo: plant OEE 77% on target, three cards at 67 / 84 / 80, each
with its three factors, each live. At 420px the grid collapses to one column and nothing is lost.

## 5. The back end still passes

```
$ dotnet build
Build succeeded.  0 Warning(s)  0 Error(s)

$ dotnet test
Passed! - Failed: 0, Passed: 13, Skipped: 0, Total: 13
```

## Changes this verification forced

| File | Why |
| --- | --- |
| `web/src/app/core/telemetry-store.ts` | Append-only reducer replaced with an order-insensitive, de-duplicating merge, so a REST back-fill under a live stream is not discarded. |
| `web/src/app/ui/production-chart.ts` | Visually hidden table wrapped in a clipping div; it was forcing a horizontal scrollbar at phone widths. |
| `web/src/app/features/overview/*`, `machine-detail/*` | Partial-window banner, so a cold start does not read as a plant in crisis; `min-inline-size: 0` on the period `<fieldset>`, which otherwise refuses to shrink below its content. |
| `docker-compose.yml` | `web` service on :8080; the API's published port moved to :5080, since the dashboard now owns the one URL a reviewer needs. |

## Not verified

- **Reconnect behaviour was not exercised against a real outage.** The backoff policy is
  unit-tested (never returns null, caps at thirty seconds) and the resubscribe path is written,
  but no run killed the API under an open dashboard and watched it recover. That is the test
  worth adding next, and it is the claim in `web/README.md` that currently rests on code review.
- **Long-run behaviour.** The longest observation here is sixteen minutes. Nothing is known about
  the page after a full shift: the sample buffer is bounded at 600 per machine, but memory,
  re-render cost and WebSocket stability over eight hours are untested.
- **Browsers other than Chromium.** One engine, headless. No Firefox, no Safari, no real phone.
  The layout uses `:has()`, `color-mix()` and logical properties, all of which are widely
  supported, but "widely supported" is not the same as "was run".
- **The 24-hour period on the detail view** returns a correct OEE, but the chart beneath it draws
  only the samples the page holds — a 500-reading back-fill is well under 24 hours. The view says
  so; it has not been checked against a stack that has actually been up that long.
- **Accessibility was built for, not audited.** Landmarks, focus rings, labelled controls,
  non-colour status signals and a table equivalent for the chart are all present and were checked
  by hand, but no screen reader was run and no automated axe pass was made.
