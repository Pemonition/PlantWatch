/**
 * Plant overview — one card per machine, live.
 *
 * Two data paths meet here and they do different jobs. OEE is a windowed aggregate the server
 * computes, so it is polled; telemetry is a stream, so it arrives on the hub and drives the
 * live/stale indicator and the piece counters between polls. Polling OEE every thirty seconds
 * rather than recomputing it client-side keeps one definition of the arithmetic, on the server,
 * where it is unit-tested.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, switchMap, timer } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import { Clock } from '../../core/clock';
import { Machine, Oee } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { TelemetryStore } from '../../core/telemetry-store';
import { clampRatio, liveness } from '../../core/oee';
import { MachineCard } from '../../ui/machine-card';
import { OeeFigure } from '../../ui/oee-figure';

/** How often the OEE aggregate is refreshed. */
const OEE_POLL_MS = 30_000;

/**
 * Window the overview reports OEE over.
 *
 * Fifteen minutes, not a shift. This board answers "what is the line doing now"; a press that
 * stopped four minutes ago has to be visible immediately, and an eight-hour average would hide
 * it behind seven good hours. Shift-length numbers are a question the detail view asks, with
 * its period selector, where the user has chosen the window deliberately.
 */
const OVERVIEW_WINDOW_MINUTES = 15;
const OVERVIEW_WINDOW_MS = OVERVIEW_WINDOW_MINUTES * 60 * 1000;

/**
 * Below this fraction of the window covered by actual run time, the overview says so.
 *
 * Planned production time is the window the client asked for, so a stack that started five
 * minutes ago is measured against fifteen minutes of plan and reports an availability around
 * a third — the arithmetic being right and the reading being useless at the same time. The
 * banner names that rather than letting a reviewer conclude the plant is on fire.
 */
const COVERAGE_HINT_BELOW = 0.6;

@Component({
  selector: 'pw-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MachineCard, OeeFigure],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class Overview implements OnInit {
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly store = inject(TelemetryStore);
  private readonly clock = inject(Clock);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly machines = signal<readonly Machine[]>([]);
  protected readonly oeeByCode = signal<Readonly<Record<string, Oee>>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly now = this.clock.now;
  protected readonly live = this.store.all;

  /** Plant OEE: the mean of the machines', which is what a plant board shows. */
  protected readonly plantOee = computed(() => {
    const values = this.machines()
      .map((machine) => this.oeeByCode()[machine.code]?.oee)
      .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) {
      return 0;
    }
    return clampRatio(values.reduce((sum, value) => sum + value, 0) / values.length);
  });

  protected readonly runningCount = computed(
    () => this.machines().filter((machine) => this.live()[machine.code]?.isRunning).length,
  );

  protected readonly windowMinutes = OVERVIEW_WINDOW_MINUTES;

  /**
   * True when every machine is reporting and running, yet run time covers little of the window
   * — the shape of a stack that has not been collecting data long enough to fill it.
   */
  protected readonly partialWindow = computed(() => {
    const figures = this.machines()
      .map((machine) => this.oeeByCode()[machine.code])
      .filter((value): value is Oee => value !== undefined);

    if (figures.length === 0) {
      return false;
    }

    // Every machine reporting, not every machine running: a stopped machine is exactly what
    // this board is for, and it must not suppress the hint.
    const allReporting = this.machines().every(
      (machine) =>
        liveness(this.live()[machine.code]?.lastTimestampMs ?? null, this.now()) !== 'offline',
    );

    // The widest coverage, not the thinnest: one genuinely broken machine should not make the
    // whole page apologise. Every machine being thin at once is the cold-start shape.
    const widest = Math.max(
      ...figures.map((figure) =>
        figure.plannedTimeMinutes > 0 ? figure.runTimeMinutes / figure.plannedTimeMinutes : 0,
      ),
    );

    return allReporting && widest < COVERAGE_HINT_BELOW;
  });

  protected readonly reportingCount = computed(
    () =>
      this.machines().filter(
        (machine) =>
          liveness(this.live()[machine.code]?.lastTimestampMs ?? null, this.now()) !== 'offline',
      ).length,
  );

  ngOnInit(): void {
    void this.realtime.connect();

    // `timer(0, n)` rather than `interval(n)`: the first poll has to be immediate, or the page
    // shows empty cards for thirty seconds on load.
    timer(0, OEE_POLL_MS)
      .pipe(
        switchMap(() => this.api.machines()),
        catchError((error: unknown) => {
          this.error.set(describe(error));
          this.loading.set(false);
          return of([] as Machine[]);
        }),
        switchMap((machines) => {
          if (machines.length === 0) {
            return of({ machines, oee: {} as Record<string, Oee> });
          }
          this.machines.set(machines);
          this.error.set(null);

          const to = new Date();
          const from = new Date(to.getTime() - OVERVIEW_WINDOW_MS);

          return forkJoin(
            Object.fromEntries(
              machines.map((machine) => [
                machine.code,
                this.api.oee(machine.code, from, to).pipe(catchError(() => of(null))),
              ]),
            ),
          ).pipe(
            switchMap((results) =>
              of({
                machines,
                oee: Object.fromEntries(
                  Object.entries(results).filter(
                    (entry): entry is [string, Oee] => entry[1] !== null,
                  ),
                ),
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ oee }) => {
        this.oeeByCode.set(oee);
        this.loading.set(false);
      });
  }

  protected oeeFor(code: string): Oee | undefined {
    return this.oeeByCode()[code];
  }
}

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error && error.status === 0) {
    return 'The API is not reachable. Is the stack running?';
  }
  return error instanceof Error ? error.message : 'The API returned an unexpected response.';
}
