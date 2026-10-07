/**
 * Tests for the presentation rules in `oee.ts`.
 *
 * These are the decisions that are easy to get wrong silently: a threshold off by a hundredth,
 * a `NaN` reaching the DOM as "NaN%", a machine that stopped reporting still showing as live.
 * None of them would fail a build or throw at runtime, which is exactly why they are pinned.
 */

import { describe, expect, it } from 'vitest';
import {
  OEE_THRESHOLDS,
  formatAge,
  formatMinutes,
  formatPercent,
  formatPercentPrecise,
  liveness,
  oeeBand,
  oeeBandLabel,
} from './oee';

describe('oeeBand', () => {
  it('classifies a world-class figure as good', () => {
    expect(oeeBand(0.85)).toBe('good');
  });

  it('treats the good threshold as inclusive', () => {
    expect(oeeBand(OEE_THRESHOLDS.good)).toBe('good');
    expect(oeeBand(OEE_THRESHOLDS.good - 0.0001)).toBe('fair');
  });

  it('treats the fair threshold as inclusive', () => {
    expect(oeeBand(OEE_THRESHOLDS.fair)).toBe('fair');
    expect(oeeBand(OEE_THRESHOLDS.fair - 0.0001)).toBe('poor');
  });

  it('reports a missing or unparseable figure as poor rather than throwing', () => {
    expect(oeeBand(Number.NaN)).toBe('poor');
    expect(oeeBand(Number.POSITIVE_INFINITY)).toBe('poor');
  });

  it('gives every band a distinct text label, so colour is never the only signal', () => {
    const labels = (['good', 'fair', 'poor'] as const).map(oeeBandLabel);
    expect(new Set(labels).size).toBe(3);
  });
});

describe('formatPercent', () => {
  it('renders a ratio as a whole-number percentage', () => {
    expect(formatPercent(0.817)).toBe('82');
    expect(formatPercent(0)).toBe('0');
    expect(formatPercent(1)).toBe('100');
  });

  it('clamps out-of-range input instead of showing an impossible figure', () => {
    expect(formatPercent(1.28)).toBe('100');
    expect(formatPercent(-0.4)).toBe('0');
  });

  it('renders an em dash for a missing figure so the layout keeps its shape', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('keeps one decimal in the precise form used by the factor rows', () => {
    expect(formatPercentPrecise(0.9523)).toBe('95.2');
    expect(formatPercentPrecise(Number.NaN)).toBe('—');
  });
});

describe('formatMinutes', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatMinutes(47)).toBe('47m');
  });

  it('formats an hour or more as hours and minutes', () => {
    expect(formatMinutes(80)).toBe('1h 20m');
    expect(formatMinutes(480)).toBe('8h 0m');
  });

  it('rejects nonsense input', () => {
    expect(formatMinutes(-1)).toBe('—');
    expect(formatMinutes(Number.NaN)).toBe('—');
  });
});

describe('liveness', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');

  it('is live for a fresh reading', () => {
    expect(liveness(now - 4_000, now)).toBe('live');
  });

  it('tolerates a few missed samples before going stale', () => {
    expect(liveness(now - 19_999, now)).toBe('live');
    expect(liveness(now - 20_000, now)).toBe('stale');
  });

  it('goes offline once the machine has not reported for two minutes', () => {
    expect(liveness(now - 119_000, now)).toBe('stale');
    expect(liveness(now - 120_000, now)).toBe('offline');
  });

  it('treats a machine that has never reported as offline, not live', () => {
    expect(liveness(null, now)).toBe('offline');
  });

  it('treats a slightly future timestamp as fresh rather than as a huge negative age', () => {
    // Device clocks drift. A reading stamped two seconds ahead of the browser must not be
    // read as "reported 2s in the future" and bucketed somewhere unexpected.
    expect(liveness(now + 2_000, now)).toBe('live');
  });
});

describe('formatAge', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');

  it('uses seconds, then minutes, then hours', () => {
    expect(formatAge(now - 4_000, now)).toBe('4s ago');
    expect(formatAge(now - 90_000, now)).toBe('1m ago');
    expect(formatAge(now - 7_200_000, now)).toBe('2h ago');
  });

  it('says so when there has never been a reading', () => {
    expect(formatAge(null, now)).toBe('never');
  });
});
