/**
 * One OEE factor as a labelled bar: availability, performance or quality.
 *
 * The bar is the comparison and the number is the value; neither alone does the job. The bar
 * is rendered as a `<meter>`-shaped div rather than a real `<meter>` because the native element
 * cannot be restyled consistently across engines and its own low/high/optimum semantics do not
 * match OEE's three bands.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { clampRatio, formatPercentPrecise, oeeBand } from '../core/oee';

@Component({
  selector: 'pw-factor-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="factor" [class]="band()">
      <div class="head">
        <span class="name">{{ label() }}</span>
        <span class="value">{{ text() }}<span class="unit">%</span></span>
      </div>
      <div
        class="track"
        role="meter"
        [attr.aria-label]="label()"
        [attr.aria-valuenow]="text()"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuetext]="text() + ' percent'"
      >
        <div class="fill" [style.inline-size.%]="percent()"></div>
      </div>
    </div>
  `,
  styles: `
    .factor {
      display: flex;
      flex-direction: column;
      gap: var(--pw-space-2);
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--pw-space-3);
    }

    .name {
      font-size: var(--pw-text-xs);
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--pw-text-muted);
    }

    .value {
      font-size: var(--pw-text-lg);
      font-weight: 600;
      font-family: var(--pw-font-mono);
      color: var(--pw-text);
    }

    .unit {
      font-size: var(--pw-text-xs);
      color: var(--pw-text-dim);
      margin-inline-start: 1px;
    }

    .track {
      block-size: 6px;
      border-radius: 999px;
      background: var(--pw-surface-sunken);
      border: 1px solid var(--pw-border);
      overflow: hidden;
    }

    .fill {
      block-size: 100%;
      background: var(--pw-accent);
      transition: inline-size 400ms ease;
    }

    .good .fill {
      background: var(--pw-good);
    }

    .fair .fill {
      background: var(--pw-fair);
    }

    .poor .fill {
      background: var(--pw-poor);
    }
  `,
})
export class FactorBar {
  readonly label = input.required<string>();
  readonly ratio = input.required<number>();

  protected readonly band = computed(() => oeeBand(this.ratio()));
  protected readonly text = computed(() => formatPercentPrecise(this.ratio()));
  protected readonly percent = computed(() => clampRatio(this.ratio()) * 100);
}
