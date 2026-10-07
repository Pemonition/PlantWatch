/**
 * Liveness indicator: shape, colour and word.
 *
 * Three signals carry the same information deliberately. Colour alone fails for the roughly
 * one in twelve men with a red-green deficiency, and it fails for everyone on a sun-washed
 * panel; the glyph differs in outline, and the word is spelled out. The `<title>` inside the
 * SVG is what a screen reader announces for the mark itself.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Liveness, livenessLabel } from '../core/oee';

@Component({
  selector: 'pw-status-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="dot" [class]="state()">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
        @switch (state()) {
          @case ('live') {
            <!-- Solid disc: reporting. -->
            <circle cx="6" cy="6" r="5" fill="currentColor" />
          }
          @case ('stale') {
            <!-- Half-filled disc: reporting, but late. -->
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="currentColor" />
          }
          @case ('offline') {
            <!-- Struck-through ring: not reporting at all. -->
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <line x1="2.6" y1="9.4" x2="9.4" y2="2.6" stroke="currentColor" stroke-width="1.5" />
          }
        }
      </svg>
      <span class="label">{{ label() }}</span>
    </span>
  `,
  styles: `
    .dot {
      display: inline-flex;
      align-items: center;
      gap: var(--pw-space-2);
      font-size: var(--pw-text-xs);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .dot svg {
      flex: none;
    }

    .live {
      color: var(--pw-good);
    }

    .stale {
      color: var(--pw-fair);
    }

    .offline {
      color: var(--pw-text-dim);
    }
  `,
})
export class StatusDot {
  readonly state = input.required<Liveness>();
  protected readonly label = computed(() => livenessLabel(this.state()));
}
