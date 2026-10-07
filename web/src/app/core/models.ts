/**
 * Wire types for the PlantWatch API.
 *
 * Hand-written rather than generated. The surface is four endpoints and three records, and a
 * generator would add a build step, a toolchain dependency and a generated-code review burden
 * out of proportion to that. The trade-off is accepted knowingly: these interfaces can drift
 * from the server, and the thing that catches drift is `web/README.md` being kept next to the
 * API table in the root README, plus the end-to-end check in `docs/verification.md`.
 */

/** `GET /api/machines` — one monitored machine. */
export interface Machine {
  readonly code: string;
  readonly name: string;
  readonly idealCycleSeconds: number;
}

/** One telemetry sample, from `GET /api/machines/{code}/readings` or the `reading` hub event. */
export interface Reading {
  readonly machineCode: string;
  /** ISO 8601 with offset, as serialised from `DateTimeOffset`. */
  readonly timestamp: string;
  readonly piecesProduced: number;
  readonly rejectedPieces: number;
  readonly isRunning: boolean;
}

/** `GET /api/machines/{code}/oee` — the three factors, their product, and the raw counters. */
export interface Oee {
  readonly machineCode: string;
  readonly from: string;
  readonly to: string;
  /** Ratios in [0, 1]; the server clamps, so the client never has to defend against 128%. */
  readonly availability: number;
  readonly performance: number;
  readonly quality: number;
  readonly oee: number;
  readonly totalPieces: number;
  readonly rejectedPieces: number;
  readonly runTimeMinutes: number;
  readonly plannedTimeMinutes: number;
}
