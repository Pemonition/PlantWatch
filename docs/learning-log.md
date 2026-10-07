# Learning log

A map, not a certificate. Over the past couple of years I worked through a number of courses
and self-directed exercises, each of which produced its own small repository: a console app, a
pattern demo, a first Web API, a Docker exercise, an Angular tutorial. In isolation none of
them says much. This table records where each piece of that learning is actually applied in
PlantWatch — which is the only form of evidence that means anything.

Where a row says "planned", it is planned and not yet built. Marking it otherwise would make
this document worthless.

| Prior learning | Where it shows up here | What it actually looks like |
| --- | --- | --- |
| C# fundamentals — types, collections, LINQ, nullable reference types | `src/PlantWatch.Domain` | Entities and value objects with no framework dependency at all. `OeeInput`/`OeeResult` are `readonly record struct`, `OeeCalculator` is static and pure. The project compiles without a single NuGet package, which is the test of whether the domain logic really is independent. |
| Design patterns — repository | `src/PlantWatch.Application/Abstractions`, `src/PlantWatch.Infrastructure/Persistence/Repositories` | The interfaces are declared in Application and implemented in Infrastructure, so the dependency points inward. The interfaces are deliberately narrow (two reads on the telemetry series) because that narrowness is what makes the storage swap in ADR 0003 possible. |
| Design patterns — adapter / dependency inversion | `ITelemetryBroadcaster` + `SignalRTelemetryBroadcaster` | Ingestion needs to push data to browsers but must not know SignalR exists. The interface lives in Application, the SignalR implementation lives in the API project. This is the seam that would let a worker process be extracted (ADR 0002). |
| Design patterns — options / configuration | `src/PlantWatch.Infrastructure/Options` | `MqttOptions` and `DatabaseOptions`, bound from configuration, validated with data annotations and `ValidateOnStart()` so bad configuration fails at startup rather than on the first connection attempt. |
| First Web API (controllers, routing, DI, Swagger) | `src/PlantWatch.Api` | Rewritten as minimal APIs with endpoint groups in `Endpoints/MachineEndpoints.cs`. Same concepts — routing, model binding, DI, OpenAPI — in the style current .NET actually uses. |
| SQL and data modelling (MySQL Workbench practice) | `src/PlantWatch.Infrastructure/Persistence` | The EF Core model: `IEntityTypeConfiguration` classes, a unique index on the business key, a composite index on `(machine_id, timestamp DESC)` chosen to match the only two query shapes the system has, cascade deletes, and an enum persisted as a string so the database stays readable. |
| Docker course (images, layers, compose, volumes) | `docker-compose.yml`, `src/PlantWatch.Api/Dockerfile`, `tools/PlantWatch.Simulator/Dockerfile` | Multi-stage builds that restore from `.csproj` files first so a source change does not invalidate the NuGet layer; non-root runtime user; four services wired with health checks and `depends_on: condition: service_healthy`. |
| Industrial automation and electrical work (day job) | The whole premise, and `tools/PlantWatch.Simulator` | Knowing what a shop floor actually produces — that machines stop for a few minutes at a time rather than one sample, that the ideal cycle time on the datasheet is not the observed average, that an OEE above 100% means someone entered the wrong spec — is the part of this project that did not come from a course. It is why the calculator clamps, and why the simulator models stops as runs of consecutive samples. |
| Unit testing (xUnit) | `tests/PlantWatch.Domain.Tests` | 13 tests over `OeeCalculator`, covering the arithmetic, every division-by-zero path, both clamping guards, and one worked shift whose expected value was calculated by hand. The calculator is pure, which is what makes that level of coverage cheap. |
| Angular practice | `web/` — **planned, phase 2** | Nothing is built yet. The API side it will consume exists and is documented: the REST endpoints plus the SignalR hub at `/hubs/telemetry`, with a named CORS policy already in place for `http://localhost:4200`. |
| ITIL incident documentation and knowledge-base writing (service desk) | `docs/adr/`, this file, `README.md` | The habit of writing down why a decision was made, in a format someone else can read later, came from documenting incidents and writing KB articles — not from a programming course. |

## What this project taught me that the courses did not

- **Aggregation is where the judgement lives.** The OEE arithmetic is five lines. Deciding what
  "run time" means when a gateway went offline for twenty minutes took far longer, and is why
  `OeeQueryService` caps the interval credited to any one sample.
- **Guard clauses are a product decision.** Returning zero for a division by zero rather than
  throwing is not laziness; a dashboard that 500s because a shift had no planned time is worse
  than one that shows a gap.
- **Writing the ADR changed the design.** Specifically ADR 0002: committing to "extractable
  later" in writing is what forced ingestion to depend only on Application interfaces, instead
  of reaching for the `DbContext` directly.
