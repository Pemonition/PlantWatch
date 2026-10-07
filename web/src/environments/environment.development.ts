/**
 * `ng serve` configuration.
 *
 * The dev server runs on :4200 and the API on :8080, so the URLs have to be absolute and the
 * requests are cross-origin. The API already ships a `dashboard` CORS policy allowing
 * `http://localhost:4200` with credentials (`Cors:Origins` to change it), so this works with
 * no server-side change — see `src/PlantWatch.Api/Program.cs`.
 *
 * Point `PW_API` at a remote host by editing this file; it is never part of a production build.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  hubUrl: 'http://localhost:8080/hubs/telemetry',
} as const;

export type Environment = typeof environment;
