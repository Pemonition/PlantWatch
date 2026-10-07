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
