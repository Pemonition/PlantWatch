# Multi-stage build for the PlantWatch dashboard.
#
# Build context is `web/` (see docker-compose.yml). The build stage needs Node and the whole
# dependency tree; the runtime stage needs neither — it ships a few hundred kilobytes of static
# files and nginx, so the published image carries no npm packages and no JavaScript runtime.

FROM node:22-alpine AS build
WORKDIR /src

# Lockfile-only restore first, so a change to a component does not invalidate the npm layer.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.29-alpine AS runtime

# Replaces the stock default server block: SPA fallback plus the /api, /hubs, /health and
# /swagger proxies that put the dashboard and the API on one origin.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# `@angular/build:application` emits the browser bundle under dist/<project>/browser.
COPY --from=build /src/dist/plantwatch-web/browser /usr/share/nginx/html

EXPOSE 80

# busybox wget, which the alpine image already has — no package to install for a health check.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -q -O /dev/null http://localhost/ || exit 1
