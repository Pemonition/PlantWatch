/**
 * The hero OEE figure.
 *
 * This is the number the whole dashboard exists to show, so it gets the largest type step, the
 * band colour, and — again — a glyph and a word, because the band must survive a monochrome
 * screen. The glyph is directional (above target / at target / below target) rather than
 * decorative, so it means something on its own.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatPercent, oeeBand, oeeBandLabel } from '../core/oee';

@Component({
  selector: 'pw-oee-figure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="figure" [class]="band()" [class.lg]="size() === 'lg'">
      <p class="pw-eyebrow">{{ caption() }}</p>
      <p class="number">
        <span class="digits">{{ text() }}</span>
        <span class="unit" aria-hidden="true">%</span>
        <span class="pw-sr-only">percent</span>
      </p>
      <p class="band">
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
          @switch (band()) {
            @case ('good') {
              <path d="M5 1 L9.5 8.5 L0.5 8.5 Z" fill="currentColor" />
            }
            @case ('fair') {
              <rect x="0.5" y="3.5" width="9" height="3" fill="currentColor" />
            }
            @case ('poor') {
              <path d="M5 9 L0.5 1.5 L9.5 1.5 Z" fill="currentColor" />
            }
          }
        </svg>
        {{ bandLabel() }}
      </p>
    </div>
  `,
  styles: `
    .figure {
      display: flex;
      flex-direction: column;
      gap: var(--pw-space-1);
      color: var(--pw-accent);
    }

    .number {
      margin: 0;
      display: flex;
      align-items: baseline;
      gap: 2px;
      font-family: var(--pw-font-mono);
      font-weight: 700;
      line-height: 0.95;
      letter-spacing: -0.03em;
      font-size: var(--pw-display-sm);
      color: currentColor;
    }

    .lg .number {
      font-size: var(--pw-display);
    }

    .unit {
      font-size: var(--pw-text-lg);
      font-weight: 600;
      color: var(--pw-text-muted);
    }

    .band {
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--pw-space-2);
      font-size: var(--pw-text-xs);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: currentColor;
    }

    .good {
      color: var(--pw-good);
    }

    .fair {
      color: var(--pw-fair);
    }

    .poor {
      color: var(--pw-poor);
    }

    @media (min-width: 900px) {
      .number {
        font-size: var(--pw-display);
      }

      .lg .number {
        font-size: var(--pw-display-lg);
      }
    }
  `,
})
export class OeeFigure {
  readonly ratio = input.required<number>();
  readonly caption = input('OEE');
  readonly size = input<'md' | 'lg'>('md');

  protected readonly band = computed(() => oeeBand(this.ratio()));
  protected readonly bandLabel = computed(() => oeeBandLabel(this.band()));
  protected readonly text = computed(() => formatPercent(this.ratio()));
}
