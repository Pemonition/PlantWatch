/**
 * Machine detail — the OEE breakdown for a chosen period, plus production over time.
 *
 * The period selector drives the `from`/`to` query on `/oee` rather than filtering client-side:
 * the server owns the aggregation (including the rule that a sample's state is only credited
 * forward five minutes), and recomputing it in the browser would be a second, divergent
 * definition of the same number.
 *
 * On entry this view calls `SubscribeToMachine`, which moves the connection out of the
 * plant-wide group on the server, so it stops receiving the rest of the plant's traffic. It
 * releases that on destroy.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { of, switchMap, timer } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import { Clock } from '../../core/clock';
import { Machine, Oee } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { TelemetryStore } from '../../core/telemetry-store';
import { formatAge, formatMinutes, liveness } from '../../core/oee';
import { FactorBar } from '../../ui/factor-bar';
import { OeeFigure } from '../../ui/oee-figure';
import { ProductionChart } from '../../ui/production-chart';
import { StatusDot } from '../../ui/status-dot';

/** Selectable reporting periods. The labels are what the control shows. */
export interface Period {
  readonly id: string;
  readonly label: string;
  readonly hours: number;
}

export const PERIODS: readonly Period[] = [
  { id: '1h', label: 'Last hour', hours: 1 },
  { id: '8h', label: 'Last 8 hours', hours: 8 },
  { id: '24h', label: 'Last 24 hours', hours: 24 },
];

/** How often the OEE aggregate is refreshed while the view is open. */
const OEE_POLL_MS = 15_000;

/** Below this fraction of the period covered by run time, the view says the window is thin. */
const COVERAGE_HINT_BELOW = 0.6;

/** Server caps `take` at 500; ask for the cap so the chart has the longest history available. */
const READINGS_TAKE = 500;

@Component({
  selector: 'pw-machine-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FactorBar, OeeFigure, ProductionChart, StatusDot],
  templateUrl: './machine-detail.html',
  styleUrl: './machine-detail.css',
})
export class MachineDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly store = inject(TelemetryStore);
  private readonly clock = inject(Clock);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly periods = PERIODS;
  protected readonly period = signal<Period>(PERIODS[0]);

  protected readonly code = signal<string>('');
  protected readonly machine = signal<Machine | null>(null);
  protected readonly oee = signal<Oee | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);

  protected readonly now = this.clock.now;

  /** The subscribed code, tracked so destroy releases exactly what init claimed. */
  private watching: string | null = null;

  protected readonly live = computed(() => this.store.all()[this.code()]);

  protected readonly samples = computed(() => this.live()?.samples ?? []);

  protected readonly state = computed(() =>
    liveness(this.live()?.lastTimestampMs ?? null, this.now()),
  );

  protected readonly age = computed(() =>
    formatAge(this.live()?.lastTimestampMs ?? null, this.now()),
  );

  /**
   * True when the machine is reporting but run time covers little of the requested period.
   *
   * Planned production time is the window the client asked for, so a period longer than the
   * stack has been collecting reports an availability near zero — right arithmetic, useless
   * reading. Saying so beats letting a reviewer conclude the machine is broken.
   */
  protected readonly partialWindow = computed(() => {
    const figures = this.oee();
    if (!figures || figures.plannedTimeMinutes <= 0) {
      return false;
    }
    return (
      this.state() !== 'offline' &&
      figures.runTimeMinutes / figures.plannedTimeMinutes < COVERAGE_HINT_BELOW
    );
  });

  protected readonly runTime = computed(() => formatMinutes(this.oee()?.runTimeMinutes ?? NaN));
  protected readonly plannedTime = computed(() =>
    formatMinutes(this.oee()?.plannedTimeMinutes ?? NaN),
  );

  ngOnInit(): void {
    void this.realtime.connect();

    this.route.paramMap
      .pipe(
        map((params) => params.get('code') ?? ''),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((code) => {
        this.code.set(code);
        this.loading.set(true);
        this.watch(code);
        this.loadMachine(code);
        this.loadReadings(code);
      });

    // One stream for the polled aggregate, re-triggered whenever the code or the period
    // changes, so changing the selector does not wait up to fifteen seconds for the next tick.
    timer(0, OEE_POLL_MS)
      .pipe(
        switchMap(() => {
          const code = this.code();
          if (!code) {
            return of(null);
          }
          const to = new Date();
          const from = new Date(to.getTime() - this.period().hours * 3_600_000);
          return this.api.oee(code, from, to).pipe(
            catchError((error: unknown) => {
              this.error.set(describe(error));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((oee) => {
        if (oee) {
          this.oee.set(oee);
          this.error.set(null);
        }
        this.loading.set(false);
      });
  }

  ngOnDestroy(): void {
    if (this.watching) {
      void this.realtime.unwatchMachine(this.watching);
      this.watching = null;
    }
  }

  /** Selecting a period refetches immediately rather than waiting for the poll. */
  protected selectPeriod(period: Period): void {
    this.period.set(period);
    const code = this.code();
    if (!code) {
      return;
    }
    const to = new Date();
    const from = new Date(to.getTime() - period.hours * 3_600_000);
    this.api
      .oee(code, from, to)
      .pipe(
        catchError((error: unknown) => {
          this.error.set(describe(error));
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((oee) => {
        if (oee) {
          this.oee.set(oee);
          this.error.set(null);
        }
      });
  }

  private watch(code: string): void {
    if (this.watching === code) {
      return;
    }
    if (this.watching) {
      void this.realtime.unwatchMachine(this.watching);
    }
    this.watching = code;
    void this.realtime.watchMachine(code);
  }

  private loadMachine(code: string): void {
    this.api
      .machines()
      .pipe(
        catchError(() => of([] as Machine[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((machines) => {
        this.machine.set(machines.find((machine) => machine.code === code) ?? null);
      });
  }

  /**
   * Back-fills the chart from REST so it is not empty for the first few seconds.
   *
   * The reducer drops anything at or before a timestamp it already holds, so this is safe to
   * run while the hub is already pushing: a sample delivered by both paths is counted once.
   */
  private loadReadings(code: string): void {
    this.api
      .readings(code, READINGS_TAKE)
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((readings) => this.store.seed(readings));
  }
}

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 0) {
      return 'The API is not reachable. Is the stack running?';
    }
    if (error.status === 404) {
      return 'This machine code is not known to the API.';
    }
  }
  return error instanceof Error ? error.message : 'The API returned an unexpected response.';
}
