/**
 * Realtime connection state, in the app header.
 *
 * A live dashboard that silently stops being live is worse than one that was never live, because
 * the stale numbers still look authoritative. The state is therefore always on screen, as a word
 * — not a coloured dot that could mean anything — and the region is `aria-live="polite"` so a
 * screen-reader user is told when the connection drops without being interrupted mid-sentence.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConnectionState, RealtimeService } from '../core/realtime.service';

@Component({
  selector: 'pw-connection-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="badge" [class]="state()" aria-live="polite" [attr.title]="title()">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
          @if (state() === 'connected') {
            <path
              d="M1 7.2 L4.4 10.4 L11 2.6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="square"
            />
          } @else if (state() === 'disconnected') {
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="square"
            />
          } @else {
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-dasharray="5 4"
            />
          }
        </svg>
      </span>
      <span class="pw-sr-only">Realtime connection:</span>
      {{ label() }}
    </p>
  `,
  styles: `
    .badge {
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: var(--pw-space-2);
      padding: var(--pw-space-1) var(--pw-space-3);
      border: 1px solid var(--pw-border);
      border-radius: 999px;
      background: var(--pw-surface-sunken);
      font-size: var(--pw-text-xs);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .mark {
      display: inline-flex;
    }

    .connected {
      color: var(--pw-good);
      border-color: color-mix(in srgb, var(--pw-good) 45%, transparent);
    }

    .connecting,
    .reconnecting {
      color: var(--pw-fair);
      border-color: color-mix(in srgb, var(--pw-fair) 45%, transparent);
    }

    .connecting .mark,
    .reconnecting .mark {
      animation: spin 1.6s linear infinite;
    }

    .disconnected {
      color: var(--pw-poor);
      border-color: color-mix(in srgb, var(--pw-poor) 45%, transparent);
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class ConnectionBadge {
  private readonly realtime = inject(RealtimeService);

  protected readonly state = this.realtime.state;

  protected readonly label = computed(() => LABELS[this.state()]);

  protected readonly title = computed(() => this.realtime.lastError() ?? LABELS[this.state()]);
}

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  connected: 'Live feed',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline',
};
