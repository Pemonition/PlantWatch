# 3. Store telemetry in PostgreSQL, with TimescaleDB as the stated upgrade path

- Status: accepted
- Date: 2026-10-01

## Context

Sensor readings are an append-only time series. At one sample every five seconds per machine,
fifty machines produce roughly 26 million rows per year. Every query against them has the same
shape: one machine, one period, ordered by time.

That access pattern is what time-series databases exist for. The candidates considered:

- **InfluxDB or Prometheus** — purpose-built, excellent compression and retention policies,
  but a second data store to operate, a second query language, and no transactional
  relationship with the machine registry. A reading whose machine does not exist becomes
  possible.
- **TimescaleDB** — a PostgreSQL extension: hypertables, automatic partitioning by time,
  columnar compression, continuous aggregates. Keeps SQL, keeps joins, keeps one database.
- **Plain PostgreSQL** — a regular table with a composite index on `(machine_id, timestamp)`.
  No extension, available in any managed Postgres, and supported by EF Core with no custom
  provider work.

The decisive question is not which scales furthest; it is which is honest about the current
data volume. At v1 scale — one small factory, months of history — a well-indexed Postgres
table answers these queries in milliseconds. Adopting a specialised store now would buy
headroom that is not needed and pay for it in operational surface and in a schema the author
cannot yet reason about from experience.

## Decision

Store readings in a plain PostgreSQL table (`sensor_readings`) with a composite index on
`(machine_id, timestamp DESC)` that matches both query shapes the system has.

Confine all time-series access behind `IReadingRepository`, which exposes exactly two reads:
"readings for a machine in a period" and "latest N readings for a machine". Nothing outside
Infrastructure may query the table.

TimescaleDB is the planned upgrade path, and it was chosen as the path precisely because it is
the one that does not require the application to change: converting the table to a hypertable
is a migration, not a rewrite.

## Consequences

- One database for both relational data and telemetry: foreign keys hold, a reading cannot
  reference a machine that does not exist, and a single backup covers everything.
- EF Core works normally — no custom provider, no second client library, no second
  connection-string concern.
- Retention, downsampling and compression are not solved. Today's answer is "the table grows";
  the table will eventually need partitioning or a retention job. That is accepted debt, and it
  is the signal to adopt Timescale.
- Aggregate queries scan raw rows. A request for a year of OEE will read every reading in that
  year. Acceptable at current volume; Timescale's continuous aggregates are the fix when it is
  not.
- The narrow repository interface is what makes the migration tractable, so widening it — for
  example by exposing `IQueryable` — would quietly forfeit this decision's main benefit.
