# 1. Record architecture decisions

- Status: accepted
- Date: 2026-10-01

## Context

PlantWatch makes a number of choices that are not obvious from reading the code: why
ingestion runs inside the API host, why telemetry lives in Postgres rather than a
purpose-built time-series database, why the MQTT payload is shaped the way it is. Six months
from now the reasoning behind each will have evaporated, and whoever picks the project up —
including its author — will either re-litigate a settled question or, worse, undo a decision
without knowing what it was protecting against.

Code comments explain *how* a thing works. They are a poor place for *why this and not that*,
because the alternatives that were rejected leave no code behind to comment on.

## Decision

Significant architectural decisions are recorded as numbered Architecture Decision Records in
`docs/adr/`, following Michael Nygard's format: Context, Decision, Consequences. Records are
immutable once accepted — a decision that changes gets a new ADR that supersedes the old one,
rather than an edit to history.

An ADR is warranted when a decision is expensive to reverse, affects more than one component,
or has a plausible alternative a reviewer would reasonably ask about. Routine choices do not
need one.

## Consequences

- A reviewer or a new contributor can understand the shape of the system from four short
  documents instead of reverse-engineering it from source.
- Rejected alternatives stay visible, so revisiting a decision starts from what was already
  considered.
- There is a small ongoing cost: a decision made in a hurry and not written down weakens the
  record. The mitigation is to keep ADRs short; a page is enough.
