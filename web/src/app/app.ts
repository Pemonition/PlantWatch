/**
 * Application shell: a header that is always visible, and the routed view.
 *
 * The header carries the only two things that are true regardless of which view is open — what
 * this is, and whether the live feed is actually live.
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ConnectionBadge } from './ui/connection-badge';

@Component({
  selector: 'pw-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, ConnectionBadge],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
