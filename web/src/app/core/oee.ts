/**
 * Presentation rules for OEE figures: how a ratio becomes a number on a wall display, and
 * which band it falls into.
 *
 * Pure functions, no Angular. Everything here is a decision a reviewer can argue with and a
 * test can pin, so it lives away from any component that renders it.
 */

/**
 * Quality band for an OEE-style ratio.
 *
 * The thresholds are the ones the industry actually quotes: 85% is the "world class" OEE
 * benchmark, ~60% is roughly the median discrete-manufacturing plant, and below 40% is
 * usually a measurement problem as much as a production one. Three bands, not five: a
 * line-side display read at four metres has to be legible, not precise.
 */
export type OeeBand = 'good' | 'fair' | 'poor';

/** Lower bound of each band, as a ratio in [0, 1]. */
export const OEE_THRESHOLDS = {
  /** At or above this, the figure is reported as good. */
  good: 0.75,
  /** At or above this (and below `good`), fair. Below it, poor. */
  fair: 0.6,
} as const;

/**
 * Classifies a ratio into a band.
 *
 * Anything that is not a finite number — a missing field, a `NaN` from a half-loaded
 * response — is `poor` rather than an exception: a dashboard that throws because one tile
 * has no data is worse than one tile reading low.
 */
export function oeeBand(ratio: number): OeeBand {
  if (!Number.isFinite(ratio)) {
    return 'poor';
  }
  if (ratio >= OEE_THRESHOLDS.good) {
    return 'good';
  }
  if (ratio >= OEE_THRESHOLDS.fair) {
    return 'fair';
  }
  return 'poor';
}

/**
 * Short text label for a band.
 *
 * Colour alone must never carry the band — this is what the card renders beside the swatch so
 * the signal survives a monochrome screen or a red-green colour deficiency.
 */
export function oeeBandLabel(band: OeeBand): string {
  switch (band) {
    case 'good':
      return 'On target';
    case 'fair':
      return 'Below target';
    case 'poor':
      return 'Critical';
  }
}

/**
 * Formats a ratio as a whole-number percentage for the hero figure.
 *
 * Whole numbers only: the decimal on a 4cm-tall number is noise, and OEE derived from a
 * five-minute window is not precise to a tenth of a percent anyway. Returns an em dash for
 * anything non-finite so the layout keeps its shape when data is missing.
 */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return '—';
  }
  return `${Math.round(clampRatio(ratio) * 100)}`;
}

/**
 * Formats a ratio as a percentage with one decimal, for the supporting factor rows where the
 * figure is small and the extra digit is readable.
 */
export function formatPercentPrecise(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return '—';
  }
  return `${(clampRatio(ratio) * 100).toFixed(1)}`;
}

/** Clamps to [0, 1]. The server clamps too; this defends the render against a bad payload. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.min(1, Math.max(0, ratio));
}

/** Formats minutes as `1h 20m`, or `47m` under the hour. Used for run and planned time. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return '—';
  }
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** Liveness of a machine, derived from how old its most recent reading is. */
export type Liveness = 'live' | 'stale' | 'offline';

/**
 * Age thresholds in milliseconds.
 *
 * The simulator publishes every 5s and the contract allows a device to be slower, so one
 * missed sample must not turn a tile red. 20s (four missed samples at the default interval)
 * is "something is wrong"; 120s is "this machine is not reporting at all".
 */
export const LIVENESS_THRESHOLDS = {
  staleAfterMs: 20_000,
  offlineAfterMs: 120_000,
} as const;

/**
 * Classifies a machine's liveness from the age of its last reading.
 *
 * `lastTimestampMs` is epoch milliseconds, `nowMs` is injected rather than read from the clock
 * so this is testable and so a whole render pass uses one consistent instant. A machine that
 * has never reported is `offline`, not `live`.
 */
export function liveness(lastTimestampMs: number | null, nowMs: number): Liveness {
  if (lastTimestampMs === null || !Number.isFinite(lastTimestampMs)) {
    return 'offline';
  }
  // A clock skew that puts the reading slightly in the future is still a fresh reading.
  const ageMs = Math.max(0, nowMs - lastTimestampMs);
  if (ageMs >= LIVENESS_THRESHOLDS.offlineAfterMs) {
    return 'offline';
  }
  if (ageMs >= LIVENESS_THRESHOLDS.staleAfterMs) {
    return 'stale';
  }
  return 'live';
}

/** Short text label for a liveness state — again so colour is never the only signal. */
export function livenessLabel(state: Liveness): string {
  switch (state) {
    case 'live':
      return 'Live';
    case 'stale':
      return 'Stale';
    case 'offline':
      return 'No signal';
  }
}

/**
 * Human-readable age of a reading, for the tile's secondary line: `4s ago`, `3m ago`, `2h ago`.
 */
export function formatAge(lastTimestampMs: number | null, nowMs: number): string {
  if (lastTimestampMs === null || !Number.isFinite(lastTimestampMs)) {
    return 'never';
  }
  const seconds = Math.max(0, Math.round((nowMs - lastTimestampMs) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  return `${Math.floor(minutes / 60)}h ago`;
}
