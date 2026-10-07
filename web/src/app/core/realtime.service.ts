/**
 * The only place in the dashboard that knows the realtime transport is SignalR.
 *
 * Mirrors `SignalRTelemetryBroadcaster` on the server, which is the only place there that knows
 * it. Components ask this service to watch a machine or the whole plant and read a connection
 * state signal; they never see a `HubConnection`.
 */

import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  IRetryPolicy,
  LogLevel,
  RetryContext,
} from '@microsoft/signalr';
import { environment } from '../../environments/environment';
import { Reading } from './models';
import { TelemetryStore } from './telemetry-store';

/** Connection state as the UI needs to show it. */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Client method name the server invokes. Must match `TelemetryHub.ReadingEvent`. */
const READING_EVENT = 'reading';

/**
 * Reconnect backoff.
 *
 * Capped exponential rather than SignalR's built-in `[0, 2s, 10s, 30s]` then give up: a
 * line-side display is left running unattended, so "stops retrying after thirty seconds" is the
 * wrong behaviour — a browser that spent the night showing a dead connection is useless. This
 * retries forever, backing off to thirty seconds so an API that is down does not get hammered.
 */
export class ForeverBackoffRetryPolicy implements IRetryPolicy {
  constructor(
    private readonly maxDelayMs = 30_000,
    private readonly baseDelayMs = 1_000,
  ) {}

  nextRetryDelayInMilliseconds(context: RetryContext): number {
    const exponential = this.baseDelayMs * 2 ** Math.min(context.previousRetryCount, 5);
    // A little jitter so a dozen wall displays reconnecting after the same outage do not all
    // hit the API on the same tick.
    const jitter = Math.random() * 500;
    return Math.min(this.maxDelayMs, exponential) + jitter;
  }
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly store = inject(TelemetryStore);
  private readonly destroyRef = inject(DestroyRef);

  private connection: HubConnection | null = null;

  /**
   * Machine codes the UI currently wants, with a reference count.
   *
   * Reference counted because two components can legitimately want the same machine at once
   * during a route transition, and because the desired set has to be re-applied after a
   * reconnect: the server puts a freshly connected client back into the plant-wide group, so
   * the detail view's narrowing is lost unless the client restates it.
   */
  private readonly desired = new Map<string, number>();

  /** Current connection state, for the badge in the header. */
  readonly state = signal<ConnectionState>('disconnected');

  /** Last transport-level error message, shown in the badge's title attribute. */
  readonly lastError = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => void this.connection?.stop());
  }

  /**
   * Starts the connection if it is not already running.
   *
   * Idempotent: every view calls it on init and the second call is a no-op, which keeps the
   * lifecycle out of the app shell.
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    const connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl)
      .withAutomaticReconnect(new ForeverBackoffRetryPolicy())
      .configureLogging(environment.production ? LogLevel.Warning : LogLevel.Information)
      .build();

    connection.on(READING_EVENT, (reading: Reading) => this.store.apply(reading));

    connection.onreconnecting((error) => {
      this.state.set('reconnecting');
      this.lastError.set(error?.message ?? null);
    });

    connection.onreconnected(() => {
      this.state.set('connected');
      this.lastError.set(null);
      // The server put us back in the plant-wide group; restate what we actually wanted.
      void this.resubscribeAll();
    });

    connection.onclose((error) => {
      this.state.set('disconnected');
      this.lastError.set(error?.message ?? null);
      // `withAutomaticReconnect` gives up only if the retry policy returns null, and ours never
      // does — so reaching here means the handshake itself failed. Retry the whole start.
      this.scheduleRestart();
    });

    this.connection = connection;
    await this.start();
  }

  /**
   * Narrows the connection to one machine.
   *
   * The server moves a connection out of the plant-wide group on the first `SubscribeToMachine`,
   * so this is what stops the detail view from receiving the whole plant's traffic.
   */
  async watchMachine(code: string): Promise<void> {
    this.desired.set(code, (this.desired.get(code) ?? 0) + 1);
    if (this.desired.get(code) === 1) {
      await this.invokeSafely('SubscribeToMachine', code);
    }
  }

  /** Releases one claim on a machine; the last release returns the connection to the plant. */
  async unwatchMachine(code: string): Promise<void> {
    const count = (this.desired.get(code) ?? 0) - 1;
    if (count > 0) {
      this.desired.set(code, count);
      return;
    }
    this.desired.delete(code);
    await this.invokeSafely('UnsubscribeFromMachine', code);
  }

  private async start(): Promise<void> {
    if (!this.connection) {
      return;
    }
    this.state.set('connecting');
    try {
      await this.connection.start();
      this.state.set('connected');
      this.lastError.set(null);
      await this.resubscribeAll();
    } catch (error) {
      this.state.set('disconnected');
      this.lastError.set(error instanceof Error ? error.message : String(error));
      this.scheduleRestart();
    }
  }

  /**
   * Retries an initial connection that never succeeded.
   *
   * `withAutomaticReconnect` only covers a connection that was once established, so without
   * this a dashboard opened before the API is up would sit disconnected forever.
   */
  private scheduleRestart(): void {
    setTimeout(() => {
      if (this.connection && this.connection.state === HubConnectionState.Disconnected) {
        void this.start();
      }
    }, 5_000);
  }

  private async resubscribeAll(): Promise<void> {
    for (const code of this.desired.keys()) {
      await this.invokeSafely('SubscribeToMachine', code);
    }
  }

  /**
   * Invokes a hub method, swallowing the failure that happens when the connection is down.
   *
   * The desired set is the source of truth and is replayed on reconnect, so a lost invocation
   * is recovered rather than lost. Throwing here would surface a transport detail in a
   * component that asked a question about machines.
   */
  private async invokeSafely(method: string, ...args: unknown[]): Promise<void> {
    if (this.connection?.state !== HubConnectionState.Connected) {
      return;
    }
    try {
      await this.connection.invoke(method, ...args);
    } catch (error) {
      this.lastError.set(error instanceof Error ? error.message : String(error));
    }
  }
}
