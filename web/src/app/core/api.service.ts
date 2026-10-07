/**
 * Typed client for the PlantWatch REST API.
 *
 * One service, one place that knows a URL shape. Components receive `Observable<T>` with real
 * types; nothing in the feature code touches `HttpClient` or a string literal path.
 */

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Machine, Oee, Reading } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Every monitored machine. Drives the overview grid. */
  machines(): Observable<Machine[]> {
    return this.http.get<Machine[]>(`${this.base}/api/machines`);
  }

  /**
   * OEE for one machine over a window.
   *
   * `from`/`to` are always sent. The server defaults to the last eight hours when they are
   * omitted, which on a stack that has been up for ten minutes returns an availability near
   * zero — arithmetically correct and completely misleading on a dashboard. The period
   * selector therefore always names its own window.
   */
  oee(code: string, from: Date, to: Date): Observable<Oee> {
    const params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());

    return this.http.get<Oee>(`${this.base}/api/machines/${encodeURIComponent(code)}/oee`, {
      params,
    });
  }

  /** Most recent telemetry samples, newest first. The server caps `take` at 500. */
  readings(code: string, take = 100): Observable<Reading[]> {
    const params = new HttpParams().set('take', String(take));

    return this.http.get<Reading[]>(
      `${this.base}/api/machines/${encodeURIComponent(code)}/readings`,
      { params },
    );
  }
}
