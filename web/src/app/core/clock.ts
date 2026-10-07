/**
 * A one-second tick, as a signal.
 *
 * Liveness ("this machine reported 4s ago") is a function of two things: the last reading and
 * the current time. The first arrives on the hub; the second has to be pushed into the reactive
 * graph or a tile that stops receiving data also stops noticing that it stopped. One shared
 * interval drives every age and liveness computation on the page.
 */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Clock {
  /** Epoch milliseconds, updated once per second. */
  readonly now = signal(Date.now());

  constructor() {
    // Root-provided and intentionally never cleared: it lives as long as the application does,
    // and a one-second timer is not a resource worth a teardown path that would only run on
    // page unload anyway.
    setInterval(() => this.now.set(Date.now()), 1_000);
  }
}
