# 2. Run MQTT ingestion inside the API host for v1

- Status: accepted
- Date: 2026-10-01

## Context

PlantWatch has two distinct workloads. One is request/response: a dashboard asking for
machines and OEE figures. The other is a continuous subscriber: consuming MQTT telemetry and
appending it to the database. These have different failure modes, different scaling curves,
and different deployment rhythms.

The textbook answer is to split them: an ASP.NET Core API and a separate .NET Worker Service,
deployed independently. The alternative is a single host that serves HTTP and runs the
subscriber as an `IHostedService` in the same process.

The constraint that decides it at this stage: v1 targets a single small factory with tens of
machines sampling every few seconds. That is a few requests per second of ingestion — orders
of magnitude below what one process handles comfortably. Meanwhile the project has one
developer, and every additional deployable unit costs a Dockerfile, a compose service, a
health check, a log stream and a release step.

## Decision

Run ingestion in the API host as a `BackgroundService` (`MqttIngestionService`) for v1.

Make the split cheap to perform later by enforcing two rules now:

- Ingestion depends only on interfaces owned by the Application layer
  (`IMachineRepository`, `IReadingRepository`, `ITelemetryBroadcaster`). It holds no
  reference to ASP.NET Core or SignalR.
- Each message is handled in its own DI scope, exactly as a Worker Service would.

Extracting a worker then means a new host project plus a new Dockerfile — not a redesign.

## Consequences

- One container to build, run, log and monitor. `docker compose up` is genuinely enough.
- The realtime push to dashboards is an in-process method call rather than a second hop
  through a message bus or Redis backplane.
- A bug in ingestion can degrade the API, and vice versa: they share a process, a thread pool
  and a memory limit. A malformed-payload loop that throws hot would affect request latency.
  This is the real cost being accepted.
- The two workloads cannot be scaled independently. More ingestion capacity means more API
  instances — and multiple instances each holding an MQTT subscription would duplicate every
  message, so horizontal scaling requires the split first. This is the trigger to revisit:
  **when one instance can no longer keep up with ingestion, or when ingestion load and request
  load start diverging, extract the worker.**
- Single-instance deployment is assumed until then, including by migrate-on-start.
