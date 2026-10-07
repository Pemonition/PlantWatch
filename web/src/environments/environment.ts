/**
 * Default (production / container) configuration.
 *
 * Both URLs are empty-prefixed on purpose: in the compose setup the dashboard is served by
 * nginx, which proxies `/api` and `/hubs` to the API container. Same origin means no CORS
 * preflight, no credentialed-origin allowlist to keep in sync, and no build-time knowledge
 * of where the API lives — the deployment decides, not the bundle.
 */
export const environment = {
  production: true,

  /** Prefix for REST calls. Empty string = same origin as the page. */
  apiBaseUrl: '',

  /** SignalR hub URL. Relative, so it inherits the page's scheme, host and port. */
  hubUrl: '/hubs/telemetry',
} as const;

export type Environment = typeof environment;
