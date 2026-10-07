/**
 * Produced vs rejected pieces over time, as a stacked column chart.
 *
 * Hand-rolled SVG, no charting library. The reasoning is in ADR 0005, and in short: this is one
 * chart with one shape, drawn from data that is already in a signal. Chart.js is ~200 kB and
 * ngx-charts pulls all of D3; either would be most of the bundle, would need its own theming
 * layer to match the tokens in `styles.css`, and would still need an accessible fallback written
 * by hand. Thirty lines of geometry is cheaper to own and cheaper to read. The cost is that
 * tooltips, zoom and panning do not exist — if this project ever needs those, swapping in a
 * library is a change to this one file.
 *
 * Accessibility: the SVG is `img`-roled with a text summary, and the same numbers are published
 * as a real `<table>` for screen readers. A chart no one can read is decoration.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Sample } from '../core/telemetry-store';

/** One aggregated column. */
interface Bucket {
  /** Epoch ms at the start of the bucket. */
  readonly t: number;
  readonly good: number;
  readonly rejected: number;
  readonly total: number;
}

/** Internal viewBox geometry. Width is arbitrary; the SVG is stretched to its container. */
const VIEW_W = 1000;
const VIEW_H = 300;

@Component({
  selector: 'pw-production-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  template: `
    <figure class="chart">
      <figcaption class="head">
        <h3>{{ title() }}</h3>
        <ul class="legend">
          <li><span class="swatch good" aria-hidden="true"></span>Good pieces</li>
          <li><span class="swatch rejected" aria-hidden="true"></span>Rejected</li>
        </ul>
      </figcaption>

      @if (buckets().length === 0) {
        <p class="empty">No telemetry in this period yet.</p>
      } @else {
        <div class="plot">
          <ul class="y-axis" aria-hidden="true">
            <li>{{ max() }}</li>
            <li>{{ max() / 2 | number: '1.0-1' }}</li>
            <li>0</li>
          </ul>

          <svg
            class="canvas"
            [attr.viewBox]="'0 0 ' + VIEW_W + ' ' + VIEW_H"
            preserveAspectRatio="none"
            role="img"
            [attr.aria-label]="summary()"
          >
            @for (line of gridLines(); track line) {
              <line
                x1="0"
                [attr.y1]="line"
                [attr.x2]="VIEW_W"
                [attr.y2]="line"
                class="grid"
                vector-effect="non-scaling-stroke"
              />
            }

            @for (bar of bars(); track bar.t) {
              @if (bar.goodHeight > 0) {
                <rect
                  class="bar-good"
                  [attr.x]="bar.x"
                  [attr.width]="bar.width"
                  [attr.y]="bar.goodY"
                  [attr.height]="bar.goodHeight"
                />
              }
              @if (bar.rejectedHeight > 0) {
                <rect
                  class="bar-rejected"
                  [attr.x]="bar.x"
                  [attr.width]="bar.width"
                  [attr.y]="bar.rejectedY"
                  [attr.height]="bar.rejectedHeight"
                />
              }
            }
          </svg>
        </div>

        <ol class="x-axis" aria-hidden="true">
          <li>{{ firstAt() | date: 'HH:mm' }}</li>
          <li>{{ midAt() | date: 'HH:mm' }}</li>
          <li>{{ lastAt() | date: 'HH:mm' }}</li>
        </ol>

        <!-- Wrapped rather than given the class directly: a <table> ignores a 1px width when
             its content is wider, so the visually hidden table would still lay out at full
             width and push a horizontal scrollbar onto the page at phone widths. The clipping
             div has no such behaviour. -->
        <div class="pw-sr-only">
          <table>
            <caption>
              {{
                summary()
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Good pieces</th>
                <th scope="col">Rejected pieces</th>
              </tr>
            </thead>
            <tbody>
              @for (bucket of buckets(); track bucket.t) {
                <tr>
                  <th scope="row">{{ bucket.t | date: 'HH:mm' }}</th>
                  <td>{{ bucket.good }}</td>
                  <td>{{ bucket.rejected }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </figure>
  `,
  styles: `
    .chart {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--pw-space-3);
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--pw-space-3);
    }

    h3 {
      font-size: var(--pw-text-base);
      font-weight: 600;
    }

    .legend {
      display: flex;
      gap: var(--pw-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--pw-text-xs);
      color: var(--pw-text-muted);
    }

    .legend li {
      display: flex;
      align-items: center;
      gap: var(--pw-space-2);
    }

    .swatch {
      inline-size: 10px;
      block-size: 10px;
      border-radius: 2px;
    }

    .swatch.good {
      background: var(--pw-accent);
    }

    .swatch.rejected {
      background: var(--pw-poor);
    }

    .plot {
      display: flex;
      gap: var(--pw-space-2);
    }

    .y-axis {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      margin: 0;
      padding: 0;
      list-style: none;
      inline-size: 2.5rem;
      text-align: end;
      font-size: var(--pw-text-2xs);
      font-family: var(--pw-font-mono);
      color: var(--pw-text-dim);
      /* Pull the first and last labels onto their gridlines. */
      margin-block: -0.4em;
    }

    .canvas {
      flex: 1 1 auto;
      inline-size: 100%;
      block-size: 170px;
      background: var(--pw-surface-sunken);
      border: 1px solid var(--pw-border);
      border-radius: var(--pw-radius);
    }

    @media (min-width: 720px) {
      .canvas {
        block-size: 220px;
      }
    }

    .grid {
      stroke: var(--pw-border);
      stroke-width: 1;
    }

    .bar-good {
      fill: var(--pw-accent);
    }

    .bar-rejected {
      fill: var(--pw-poor);
    }

    .x-axis {
      display: flex;
      justify-content: space-between;
      margin: 0;
      padding-inline-start: 3rem;
      list-style: none;
      font-size: var(--pw-text-2xs);
      font-family: var(--pw-font-mono);
      color: var(--pw-text-dim);
    }

    .empty {
      margin: 0;
      padding: var(--pw-space-6) var(--pw-space-4);
      text-align: center;
      color: var(--pw-text-muted);
      background: var(--pw-surface-sunken);
      border: 1px dashed var(--pw-border);
      border-radius: var(--pw-radius);
    }
  `,
})
export class ProductionChart {
  readonly samples = input.required<readonly Sample[]>();
  readonly title = input('Production');
  /** Target column count. Enough resolution to see a stop, few enough to stay legible at 400px. */
  readonly columns = input(40);

  protected readonly VIEW_W = VIEW_W;
  protected readonly VIEW_H = VIEW_H;

  /** Samples aggregated into evenly spaced time buckets, oldest first. */
  protected readonly buckets = computed<Bucket[]>(() => {
    const points = this.samples();
    if (points.length === 0) {
      return [];
    }

    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const n = Math.max(1, Math.min(this.columns(), points.length));

    const acc: Bucket[] = Array.from({ length: n }, (_, i) => ({
      t: t0 + (span * i) / n,
      good: 0,
      rejected: 0,
      total: 0,
    }));

    for (const point of points) {
      const index = Math.min(n - 1, Math.max(0, Math.floor(((point.t - t0) / span) * n)));
      const bucket = acc[index];
      const rejected = Math.max(0, point.rejected);
      const good = Math.max(0, point.produced - rejected);
      acc[index] = {
        t: bucket.t,
        good: bucket.good + good,
        rejected: bucket.rejected + rejected,
        total: bucket.total + good + rejected,
      };
    }

    return acc;
  });

  /** Y-axis maximum. Never zero, so an all-idle period still draws a sane empty frame. */
  protected readonly max = computed(() =>
    Math.max(1, ...this.buckets().map((bucket) => bucket.total)),
  );

  protected readonly gridLines = computed(() => [1, VIEW_H / 2, VIEW_H - 1]);

  /** Column geometry in viewBox units. */
  protected readonly bars = computed(() => {
    const buckets = this.buckets();
    const max = this.max();
    const slot = VIEW_W / buckets.length;
    // A 20% gutter keeps the columns distinct without making them hairlines at 40 columns.
    const width = Math.max(1, slot * 0.8);

    return buckets.map((bucket, index) => {
      const goodHeight = (bucket.good / max) * VIEW_H;
      const rejectedHeight = (bucket.rejected / max) * VIEW_H;
      return {
        t: bucket.t,
        x: index * slot + (slot - width) / 2,
        width,
        // Rejected sits on top of good, so the column's full height is total production and
        // the red cap is the loss — the comparison a quality figure is actually about.
        goodY: VIEW_H - goodHeight,
        goodHeight,
        rejectedY: VIEW_H - goodHeight - rejectedHeight,
        rejectedHeight,
      };
    });
  });

  protected readonly firstAt = computed(() => this.buckets()[0]?.t ?? 0);
  protected readonly lastAt = computed(() => this.buckets()[this.buckets().length - 1]?.t ?? 0);
  protected readonly midAt = computed(() => (this.firstAt() + this.lastAt()) / 2);

  protected readonly summary = computed(() => {
    const buckets = this.buckets();
    const good = buckets.reduce((sum, bucket) => sum + bucket.good, 0);
    const rejected = buckets.reduce((sum, bucket) => sum + bucket.rejected, 0);
    return `${this.title()}: ${good} good pieces and ${rejected} rejected across ${buckets.length} intervals.`;
  });
}
