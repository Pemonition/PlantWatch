/**
 * One machine on the plant overview.
 *
 * The whole card is a link to the detail view: a tile that is partly clickable is a tile people
 * click wrongly, and one anchor is also one tab stop. OEE is the hero; the three factors sit
 * under it because they are the diagnosis and OEE is the symptom.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Machine, Oee } from '../core/models';
import { MachineLive } from '../core/telemetry-store';
import { formatAge, liveness, oeeBand } from '../core/oee';
import { OeeFigure } from './oee-figure';
import { FactorBar } from './factor-bar';
import { StatusDot } from './status-dot';

@Component({
  // Attribute selector on an <li>: the card is always a list item inside the overview's <ul>,
  // and a wrapper element between them would be invalid HTML and would break list semantics
  // for screen readers.
  selector: 'li[pw-machine-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card', '[class]': 'band()' },
  imports: [RouterLink, OeeFigure, FactorBar, StatusDot],
  template: `
    <a class="surface" [routerLink]="['/machines', machine().code]">
      <header class="head">
        <div class="identity">
          <h3 class="name">{{ machine().name }}</h3>
          <p class="code">{{ machine().code }}</p>
        </div>
        <pw-status-dot [state]="state()" />
      </header>

      @if (oee(); as figures) {
        <pw-oee-figure [ratio]="figures.oee" [caption]="'OEE — last ' + windowMinutes() + ' min'" />

        <div class="factors">
          <pw-factor-bar label="Availability" [ratio]="figures.availability" />
          <pw-factor-bar label="Performance" [ratio]="figures.performance" />
          <pw-factor-bar label="Quality" [ratio]="figures.quality" />
        </div>
      } @else {
        <p class="pending">Waiting for the first OEE window…</p>
      }

      <footer class="foot">
        <span>{{ runState() }}</span>
        <span class="age">Last reading {{ age() }}</span>
      </footer>
    </a>
  `,
  styles: `
    :host {
      list-style: none;
      display: flex;
    }

    .surface {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: var(--pw-space-4);
      padding: var(--pw-space-4);
      background: var(--pw-surface);
      border: 1px solid var(--pw-border);
      /* The band is carried on a thick leading edge as well as in the figure, so a wall of
         cards can be scanned for red without reading any of them. */
      border-inline-start: 4px solid var(--pw-border-strong);
      border-radius: var(--pw-radius-lg);
      transition:
        background 140ms ease,
        border-color 140ms ease;
    }

    .surface:hover {
      background: var(--pw-surface-raised);
      border-color: var(--pw-border-strong);
    }

    :host(.good) .surface {
      border-inline-start-color: var(--pw-good);
    }

    :host(.fair) .surface {
      border-inline-start-color: var(--pw-fair);
    }

    :host(.poor) .surface {
      border-inline-start-color: var(--pw-poor);
    }

    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--pw-space-3);
    }

    .identity {
      min-inline-size: 0;
    }

    .name {
      font-size: var(--pw-text-lg);
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .code {
      margin: var(--pw-space-1) 0 0;
      font-family: var(--pw-font-mono);
      font-size: var(--pw-text-xs);
      letter-spacing: 0.08em;
      color: var(--pw-text-dim);
    }

    .factors {
      display: flex;
      flex-direction: column;
      gap: var(--pw-space-3);
    }

    .pending {
      margin: 0;
      color: var(--pw-text-muted);
      font-size: var(--pw-text-sm);
    }

    .foot {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--pw-space-2);
      padding-block-start: var(--pw-space-3);
      border-block-start: 1px solid var(--pw-border);
      font-size: var(--pw-text-xs);
      color: var(--pw-text-muted);
    }

    .age {
      font-family: var(--pw-font-mono);
      color: var(--pw-text-dim);
    }
  `,
})
export class MachineCard {
  readonly machine = input.required<Machine>();
  readonly live = input<MachineLive | undefined>(undefined);
  readonly oee = input<Oee | undefined>(undefined);
  /** Current time in epoch ms, injected so every card on the page agrees on "now". */
  readonly now = input.required<number>();
  /** Length of the OEE window the parent asked the API for, so the caption cannot drift from it. */
  readonly windowMinutes = input.required<number>();

  protected readonly state = computed(() =>
    liveness(this.live()?.lastTimestampMs ?? null, this.now()),
  );

  protected readonly band = computed(() => oeeBand(this.oee()?.oee ?? 0));

  protected readonly age = computed(() =>
    formatAge(this.live()?.lastTimestampMs ?? null, this.now()),
  );

  protected readonly runState = computed(() => {
    const live = this.live();
    if (!live) {
      return 'No telemetry yet';
    }
    return live.isRunning ? 'Running' : 'Stopped';
  });
}
