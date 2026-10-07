/**
 * Tests for the realtime reducer.
 *
 * The failure modes here are the ones that make a live dashboard quietly lie: a redelivered
 * sample counted twice after a reconnect, a REST back-fill silently discarded because it is
 * older than what the socket already delivered, an unbounded buffer on a display left open for
 * a shift. All three are cheap to assert and expensive to notice in production.
 */

import { describe, expect, it } from 'vitest';
import { Reading } from './models';
import { applyReading, emptyTelemetryState, mergeReadings } from './telemetry-store';

function reading(overrides: Partial<Reading> = {}): Reading {
  return {
    machineCode: 'PRESS-01',
    timestamp: '2026-10-01T12:00:00.000Z',
    piecesProduced: 2,
    rejectedPieces: 0,
    isRunning: true,
    ...overrides,
  };
}

const at = (iso: string) => Date.parse(iso);

describe('applyReading', () => {
  it('creates a machine the state has never seen', () => {
    const state = applyReading(emptyTelemetryState, reading());

    expect(Object.keys(state)).toEqual(['PRESS-01']);
    expect(state['PRESS-01'].piecesProduced).toBe(2);
    expect(state['PRESS-01'].lastTimestampMs).toBe(at('2026-10-01T12:00:00.000Z'));
    expect(state['PRESS-01'].samples).toHaveLength(1);
  });

  it('accumulates the per-sample deltas the MQTT contract sends', () => {
    let state = applyReading(emptyTelemetryState, reading({ piecesProduced: 2 }));
    state = applyReading(
      state,
      reading({ timestamp: '2026-10-01T12:00:05.000Z', piecesProduced: 3, rejectedPieces: 1 }),
    );

    expect(state['PRESS-01'].piecesProduced).toBe(5);
    expect(state['PRESS-01'].rejectedPieces).toBe(1);
    expect(state['PRESS-01'].samples).toHaveLength(2);
  });

  it('drops a redelivered sample instead of counting it twice', () => {
    const first = applyReading(emptyTelemetryState, reading());
    const again = applyReading(first, reading());

    // Same reference: nothing changed, so nothing downstream needs to re-render.
    expect(again).toBe(first);
    expect(again['PRESS-01'].piecesProduced).toBe(2);
  });

  it('drops a sample with an unparseable timestamp rather than corrupting the ordering', () => {
    const state = applyReading(emptyTelemetryState, reading({ timestamp: 'not a date' }));

    expect(state).toBe(emptyTelemetryState);
  });

  it('keeps machines independent of one another', () => {
    let state = applyReading(emptyTelemetryState, reading({ machineCode: 'PRESS-01' }));
    state = applyReading(state, reading({ machineCode: 'LATHE-02', piecesProduced: 7 }));

    expect(state['PRESS-01'].piecesProduced).toBe(2);
    expect(state['LATHE-02'].piecesProduced).toBe(7);
  });

  it('tracks the latest running state', () => {
    let state = applyReading(emptyTelemetryState, reading({ isRunning: true }));
    state = applyReading(
      state,
      reading({ timestamp: '2026-10-01T12:00:05.000Z', isRunning: false }),
    );

    expect(state['PRESS-01'].isRunning).toBe(false);
  });

  it('does not let a back-filled older sample rewind the live state', () => {
    let state = applyReading(
      emptyTelemetryState,
      reading({ timestamp: '2026-10-01T12:00:10.000Z', isRunning: true }),
    );
    state = applyReading(
      state,
      reading({ timestamp: '2026-10-01T12:00:05.000Z', isRunning: false }),
    );

    expect(state['PRESS-01'].lastTimestampMs).toBe(at('2026-10-01T12:00:10.000Z'));
    expect(state['PRESS-01'].isRunning).toBe(true);
    // The older sample is still kept, as history.
    expect(state['PRESS-01'].samples.map((s) => s.t)).toEqual([
      at('2026-10-01T12:00:05.000Z'),
      at('2026-10-01T12:00:10.000Z'),
    ]);
  });

  it('bounds the sample buffer, discarding the oldest', () => {
    let state = emptyTelemetryState;
    for (let i = 0; i < 10; i++) {
      state = applyReading(
        state,
        reading({
          timestamp: new Date(at('2026-10-01T12:00:00.000Z') + i * 5_000).toISOString(),
          piecesProduced: 1,
        }),
        3,
      );
    }

    expect(state['PRESS-01'].samples).toHaveLength(3);
    // The counter is a running total and is not affected by the buffer bound.
    expect(state['PRESS-01'].piecesProduced).toBe(10);
    expect(state['PRESS-01'].samples.at(-1)?.t).toBe(at('2026-10-01T12:00:45.000Z'));
  });
});

describe('mergeReadings', () => {
  const page: Reading[] = [
    reading({ timestamp: '2026-10-01T12:00:10.000Z', piecesProduced: 3 }),
    reading({ timestamp: '2026-10-01T12:00:05.000Z', piecesProduced: 2 }),
    reading({ timestamp: '2026-10-01T12:00:00.000Z', piecesProduced: 1 }),
  ];

  it('applies a newest-first REST page without caring about its order', () => {
    const state = mergeReadings(emptyTelemetryState, page);

    expect(state['PRESS-01'].piecesProduced).toBe(6);
    expect(state['PRESS-01'].samples.map((sample) => sample.produced)).toEqual([1, 2, 3]);
    expect(state['PRESS-01'].lastTimestampMs).toBe(at('2026-10-01T12:00:10.000Z'));
  });

  it('back-fills history underneath samples the live stream already delivered', () => {
    // The detail view opens after the overview has been streaming for a while: every REST
    // reading is older than what is already held. An append-only reducer would discard the lot
    // and leave the chart with a single column.
    const streamed = applyReading(
      emptyTelemetryState,
      reading({ timestamp: '2026-10-01T12:00:20.000Z', piecesProduced: 4 }),
    );
    const backfilled = mergeReadings(streamed, page);

    expect(backfilled['PRESS-01'].samples).toHaveLength(4);
    expect(backfilled['PRESS-01'].piecesProduced).toBe(10);
    expect(backfilled['PRESS-01'].lastTimestampMs).toBe(at('2026-10-01T12:00:20.000Z'));
  });

  it('is idempotent, so a back-fill overlapping the live stream double-counts nothing', () => {
    const once = mergeReadings(emptyTelemetryState, page);
    const twice = mergeReadings(once, page);

    expect(twice).toBe(once);
    expect(twice['PRESS-01'].piecesProduced).toBe(6);
    expect(twice['PRESS-01'].samples).toHaveLength(3);
  });

  it('splits a mixed batch across machines', () => {
    const state = mergeReadings(emptyTelemetryState, [
      reading({ machineCode: 'PRESS-01', piecesProduced: 1 }),
      reading({ machineCode: 'PACK-03', piecesProduced: 9 }),
      reading({
        machineCode: 'PRESS-01',
        timestamp: '2026-10-01T12:00:05.000Z',
        piecesProduced: 1,
      }),
    ]);

    expect(state['PRESS-01'].piecesProduced).toBe(2);
    expect(state['PACK-03'].piecesProduced).toBe(9);
  });

  it('keeps samples sorted oldest-first so the chart can read them directly', () => {
    const state = mergeReadings(emptyTelemetryState, [
      reading({ timestamp: '2026-10-01T12:00:15.000Z' }),
      reading({ timestamp: '2026-10-01T12:00:00.000Z' }),
      reading({ timestamp: '2026-10-01T12:00:10.000Z' }),
      reading({ timestamp: '2026-10-01T12:00:05.000Z' }),
    ]);

    const times = state['PRESS-01'].samples.map((sample) => sample.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
