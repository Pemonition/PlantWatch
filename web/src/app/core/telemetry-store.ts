/**
 * Live telemetry state for the whole plant, and the pure reducer that advances it.
 *
 * The reducer is deliberately separated from the Angular signal that holds it. Everything
 * interesting about realtime — duplicate delivery after a reconnect, out-of-order samples, how
 * much history to keep in memory — is decided in `applyReading`, which takes a state and a
 * reading and returns a state. That function is unit-tested; the signal wrapper around it is
 * three lines and is not.
 */

import { Injectable, computed, signal } from '@angular/core';
import { Reading } from './models';

/** One point kept for the sparkline / detail chart. */
export interface Sample {
  /** Epoch milliseconds, parsed once at ingest so the render path never parses a string. */
  readonly t: number;
  readonly produced: number;
  readonly rejected: number;
  readonly running: boolean;
}

/** Everything the dashboard knows about one machine from the live stream. */
export interface MachineLive {
  readonly machineCode: string;
  /** Epoch ms of the most recent applied reading; `null` before the first one. */
  readonly lastTimestampMs: number | null;
  /** State reported by the most recent applied reading. */
  readonly isRunning: boolean;
  /** Pieces summed over every applied reading — the window this session has observed. */
  readonly piecesProduced: number;
  /** Rejects summed over the same window. */
  readonly rejectedPieces: number;
  /** Bounded history, oldest first. */
  readonly samples: readonly Sample[];
}

/** Plant-wide live state, keyed by machine code. */
export type TelemetryState = Readonly<Record<string, MachineLive>>;

/**
 * How many samples to keep per machine.
 *
 * 600 samples is fifty minutes at the simulator's five-second interval, and it is sized to hold
 * a full REST back-fill (the API caps `take` at 500) plus the live readings that arrive while
 * the page is open. The bound exists because this is a wall display: it is expected to be left
 * open for a shift, and an unbounded array would grow for eight hours.
 */
export const MAX_SAMPLES = 600;

/** The empty plant. */
export const emptyTelemetryState: TelemetryState = Object.freeze({});

/**
 * Merges readings for one machine into the state and returns a new state (or the same reference
 * when nothing changed).
 *
 * The rules, each of which has bitten a realtime dashboard before:
 *
 * 1. **A machine the state has never seen is created.** The hub can push a code the REST machine
 *    list did not contain — the API auto-registers unknown machines on first telemetry — so this
 *    is a normal event, not an error.
 * 2. **A timestamp already held is ignored.** SignalR redelivers on reconnect and MQTT is
 *    at-least-once, and the detail view deliberately back-fills over readings the live stream has
 *    already delivered. Counting one of those twice would inflate the piece count, which is the
 *    number the page is about. De-duplicating by timestamp makes the merge idempotent.
 * 3. **Order does not matter.** The live stream arrives newest-last, `GET /readings` returns
 *    newest-first, and the two overlap. Samples are merged and re-sorted rather than appended, so
 *    a back-fill after an hour of streaming fills in the history instead of being discarded for
 *    being old — the bug an append-only "newer than the last one" rule produces.
 * 4. **Counters accumulate over genuinely new samples.** The payload carries deltas since the
 *    previous sample (ADR 0004), not lifetime totals, so the figure on a tile is a sum over what
 *    this session has observed and is reset by a page reload. The UI says so rather than
 *    implying it is a shift total.
 * 5. **`lastTimestampMs` and `isRunning` only move forward.** Back-filling history must not make
 *    a live machine look like it last reported an hour ago.
 */
export function mergeReadings(
  state: TelemetryState,
  readings: readonly Reading[],
  maxSamples: number = MAX_SAMPLES,
): TelemetryState {
  let next = state;

  // Group first so a mixed batch (the hub pushes one machine, a back-fill another) costs one
  // rebuild per machine rather than one per reading.
  const byMachine = new Map<string, Reading[]>();
  for (const reading of readings) {
    const t = Date.parse(reading.timestamp);
    if (!Number.isFinite(t)) {
      // An unparseable timestamp cannot be ordered against anything, so it cannot be merged
      // safely. Dropping it loses one sample; keeping it would break the ordering invariant.
      continue;
    }
    const bucket = byMachine.get(reading.machineCode);
    if (bucket) {
      bucket.push(reading);
    } else {
      byMachine.set(reading.machineCode, [reading]);
    }
  }

  for (const [code, incoming] of byMachine) {
    const previous = next[code];
    const known = new Set((previous?.samples ?? []).map((sample) => sample.t));

    const fresh: Sample[] = [];
    let addedProduced = 0;
    let addedRejected = 0;

    for (const reading of incoming) {
      const t = Date.parse(reading.timestamp);
      if (known.has(t)) {
        continue;
      }
      known.add(t);
      fresh.push({
        t,
        produced: reading.piecesProduced,
        rejected: reading.rejectedPieces,
        running: reading.isRunning,
      });
      addedProduced += reading.piecesProduced;
      addedRejected += reading.rejectedPieces;
    }

    if (fresh.length === 0) {
      continue;
    }

    const samples = [...(previous?.samples ?? []), ...fresh].sort((a, b) => a.t - b.t);
    if (samples.length > maxSamples) {
      samples.splice(0, samples.length - maxSamples);
    }

    const newest = samples[samples.length - 1];
    const previousNewest = previous?.lastTimestampMs ?? Number.NEGATIVE_INFINITY;
    const advanced = newest.t > previousNewest;

    next = {
      ...next,
      [code]: {
        machineCode: code,
        lastTimestampMs: advanced ? newest.t : previous!.lastTimestampMs,
        isRunning: advanced ? newest.running : (previous?.isRunning ?? false),
        piecesProduced: (previous?.piecesProduced ?? 0) + addedProduced,
        rejectedPieces: (previous?.rejectedPieces ?? 0) + addedRejected,
        samples,
      },
    };
  }

  return next;
}

/** Convenience wrapper for the single reading the hub pushes. */
export function applyReading(
  state: TelemetryState,
  reading: Reading,
  maxSamples: number = MAX_SAMPLES,
): TelemetryState {
  return mergeReadings(state, [reading], maxSamples);
}

/**
 * Signal-backed holder for {@link TelemetryState}.
 *
 * Root-provided so the overview and the detail view share one copy of the live data: navigating
 * from a tile to its detail page must not throw away the history already received.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryStore {
  private readonly state = signal<TelemetryState>(emptyTelemetryState);

  /** Read-only view of the whole plant. */
  readonly all = this.state.asReadonly();

  /** Machine codes currently known to the live stream. */
  readonly codes = computed(() => Object.keys(this.state()).sort());

  /** Applies one reading from the hub. */
  apply(reading: Reading): void {
    this.state.update((s) => applyReading(s, reading));
  }

  /**
   * Merges a page of REST readings. Order-insensitive, so the API's newest-first page needs no
   * pre-processing, and overlap with what the hub already delivered is de-duplicated.
   */
  seed(readings: readonly Reading[]): void {
    this.state.update((s) => mergeReadings(s, readings));
  }

  /** Live state for one machine, or `undefined` if nothing has arrived for it yet. */
  machine(code: string): MachineLive | undefined {
    return this.state()[code];
  }
}
