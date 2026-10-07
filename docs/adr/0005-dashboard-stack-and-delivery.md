# 5. Dashboard stack, charting and delivery

- Status: accepted
- Date: 2026-10-01

## Context

Phase 1 ends with a working API: REST for machines, readings and OEE, and a SignalR hub pushing
every ingested sample. None of it is visible to the person the project is for — a supervisor on
a factory floor who wants to know which machine is losing them time right now. Phase 2 is the
dashboard, and three decisions in it are worth recording because each had a cheaper-looking
alternative.

The constraints that shaped all three:

- The demo has to be one command. `docker compose up -d --build`, open a browser, see machines.
  Anything that needs a second terminal, an API key or a CORS explanation has failed.
- The target screen is a display beside a line, read at a distance, as well as a phone in
  someone's hand on the floor. Both, from one layout.
- The whole repository is maintained by one person. Every dependency is something that will need
  a major-version migration at some point, paid for by that same person.

## Decision

### 1. Angular with standalone components, signals and zoneless change detection

Angular rather than React or Svelte: the back end is ASP.NET Core and the audience for this
project is the .NET/enterprise world, where Angular is the idiomatic front end. A reviewer
reading both halves sees one opinionated, batteries-included framework on each side rather than
a framework and an assembled toolkit.

Within Angular, the modern surface only:

- **Standalone components, no `NgModule`.** Modules were an indirection that existed to tell the
  compiler what a template could see; `imports` on the component says it in the one place it is
  checked. There is no `app.module.ts` in this repository and there should never be one.
- **Signals for all state**, with `computed` for everything derived. The page is a clock, a
  stream and two fetches combining into a render; that is a dependency graph, and signals are
  the primitive that expresses it without a subscription to leak.
- **Zoneless change detection.** `zone.js` exists to monkey-patch `setTimeout`, `fetch` and the
  rest so a framework that cannot observe state changes can guess when to re-render. With every
  piece of state in a signal, the guess is unnecessary. Dropping it removes a ~30 kB polyfill
  and, more usefully, stops a one-second clock tick from scheduling a whole-tree check.
- **`@if` / `@for` control flow** rather than the structural directives. One less import per
  component and a parser error instead of a silent no-op when a block is misspelled.
- **Typed `HttpClient`** behind a single `ApiService`. Interfaces are hand-written rather than
  generated from the OpenAPI document — see "consequences", this one is a real trade-off.

### 2. A hand-rolled SVG chart, not a charting library

The detail view needs one chart: produced versus rejected pieces over the period, as stacked
columns. The candidates were Chart.js (~200 kB with its canvas renderer), ngx-charts (pulls most
of D3, and is an Angular-version-coupled wrapper), and about a hundred lines of SVG.

SVG won on four counts, in order of weight:

1. **Bundle.** The whole application is ~88 kB over the wire. A charting library would be the
   largest thing in it, for one chart with one shape.
2. **Theming.** Every colour and spacing value in this dashboard is a custom property in
   `styles.css`. An SVG `<rect>` takes `fill: var(--pw-accent)` directly. A library takes a
   theme object that has to be kept in sync with the tokens by hand, and loses the sync quietly.
3. **Accessibility.** A chart that only exists as a canvas is invisible to a screen reader.
   `ProductionChart` emits an `aria-label` summary and a real `<table>` of the same numbers; with
   a library, that table has to be hand-written anyway, so the library saves nothing here.
4. **Maintenance.** The geometry is a `computed` that buckets samples and multiplies — it has no
   version, no breaking changes and no peer-dependency range against the Angular major.

The honest cost is in "consequences" below.

### 3. nginx serves the bundle and proxies the API, so there is one origin

The dashboard container is a multi-stage build: Node compiles, nginx serves. nginx also proxies
`/api`, `/hubs`, `/health` and `/swagger` to the `api` service over the compose network.

The alternative was to publish both containers and have the browser call the API cross-origin,
which the API is already configured for — it ships a `dashboard` CORS policy. That works, and it
means every deployment has to keep an allowlist of front-end origins in step with wherever the
front end is actually served from, that a credentialed cross-origin request needs a preflight on
every non-simple call, and that the API's base URL has to be known at build time and baked into
the JavaScript bundle.

Proxying removes all three. The bundle ships `apiBaseUrl: ''` — every call is relative, so the
deployment decides where the API is, not the build. `ng serve` is the one case that cannot be
same-origin, and `environment.development.ts` carries absolute URLs for it; that is exactly what
the existing CORS policy already allows.

The WebSocket upgrade is the detail that makes this non-trivial: nginx drops the `Upgrade` and
`Connection` headers by default, so a hub behind a naive proxy silently falls back to long
polling. `web/nginx.conf` forwards them explicitly and raises the read timeout to an hour,
because a healthy hub is silent between readings and the 60-second default would cut an idle
machine's connection.

The dashboard takes port 8080 on the host, since that is the one URL a reviewer should need. The
API keeps a published port of its own, 5080, for direct access; nothing in the stack depends on
it being published.

## Consequences

**Good.**

- One command, one URL, no CORS conversation. The compose file is the deployment description.
- The production image contains nginx and ~330 kB of static files: no Node, no npm tree, no
  JavaScript runtime in the thing that faces the network.
- The realtime path has one owner. `RealtimeService` is the only file that imports
  `@microsoft/signalr`, mirroring `SignalRTelemetryBroadcaster` being the only server file that
  knows the transport. Replacing SignalR with server-sent events is a change to two files.
- The reducer that advances live state is a pure function with no Angular import, so the
  interesting realtime behaviour — redelivery after a reconnect, a REST back-fill overlapping the
  stream, the bounded buffer — is unit-tested without a browser or a test bed.

**Bad, and accepted.**

- **Hand-written API interfaces can drift from the server.** A field renamed in `OeeDto` compiles
  on both sides and fails at runtime, as `undefined` rendered into a template. Generating from
  the OpenAPI document the API already publishes would catch it. It was not done because the
  generator is a build-time dependency and a code-review burden out of proportion to four
  endpoints and three records. The mitigation is that the contract is documented in two places
  that are reviewed together, and `docs/verification.md` exercises it against the real stack. If
  the API surface triples, this decision should be revisited rather than defended.
- **The chart has no tooltips, no zoom and no pan.** It is a static picture of a bucketed series.
  That is enough for "is this line producing", and it is not enough for "what happened at 14:32".
  The first person who needs the second should reach for a library; the change is confined to
  `ProductionChart`.
- **Zoneless means a stray `setTimeout` that mutates a plain field will not re-render.** This is
  a correctness trap for a future contributor who has not internalised signals. It is mitigated
  by there being no plain mutable fields in any component — but it is a real rule, not a style
  preference.
- **nginx resolves `api` when it parses the upstream block**, so the web container will not start
  if the API container is absent. `depends_on: condition: service_healthy` handles the compose
  case; a deployment that starts the two independently needs a resolver directive instead.
- **Angular 22 requires Node >= 22.22.3.** The floor is declared in `package.json` `engines` so a
  too-old toolchain fails with a clear message rather than inside a build.
