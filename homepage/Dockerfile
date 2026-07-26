# Homepage - Next.js Static Build
# Build context = repository root (see docker-compose.yml) so TalariaV16.jsx is available
# at ../Sources Handoff relative to this folder (webpack alias in next.config.mjs).
#
# Chart static (/chart/dist-v9, /chart/modules, chart.js) is built in chart_assets
# so nginx serves the same versions as trading-chart — not stale committed public/chart.

ARG CHECKPOINT_BUILD=0
ARG CHART_BUILD_ID=
ARG SOURCE_COMMIT_SHA=

FROM node:20-alpine AS chart_assets
WORKDIR /build
ARG CHECKPOINT_BUILD
ARG CHART_BUILD_ID
ARG SOURCE_COMMIT_SHA
ENV BUILD_ID=${CHART_BUILD_ID} \
    CHECKPOINT_BUILD=${CHECKPOINT_BUILD}
COPY ["chart v 1.4/talaria-design/package.json", "chart v 1.4/talaria-design/package-lock.json", "./talaria-design/"]
WORKDIR /build/talaria-design
ENV npm_config_foreground_scripts=true
RUN npm ci
WORKDIR /build
COPY ["scripts/checkpoint-build-assert.mjs", "./checkpoint-tools/checkpoint-build-assert.mjs"]
COPY ["scripts/lib/checkpoint-provenance.mjs", "./checkpoint-tools/lib/checkpoint-provenance.mjs"]
COPY ["scripts/lib/homepage-forwarding-contracts.mjs", "./checkpoint-tools/lib/homepage-forwarding-contracts.mjs"]
COPY ["scripts/lib/homepage-forwarding-contracts.mjs", "/scripts/lib/homepage-forwarding-contracts.mjs"]
COPY ["chart v 1.4/talaria-design", "./talaria-design/"]
COPY ["chart v 1.4/chart", "./chart/"]
WORKDIR /build/talaria-design
ENV NODE_ENV=production
RUN if [ "$CHECKPOINT_BUILD" = "1" ]; then \
      node /build/checkpoint-tools/checkpoint-build-assert.mjs inputs \
        --strict="$CHECKPOINT_BUILD" \
        --build-id="$CHART_BUILD_ID" \
        --source-sha="$SOURCE_COMMIT_SHA"; \
    elif [ -n "$CHART_BUILD_ID" ]; then \
      echo "CHART_BUILD_ID requires CHECKPOINT_BUILD=1" >&2; exit 1; \
    fi \
    && if [ "$CHECKPOINT_BUILD" = "1" ]; then \
      node /build/chart/modules/m19-progressive-session-soak.test.mjs; \
    fi \
    && if [ "$CHECKPOINT_BUILD" = "1" ]; then \
      BUILD_ID="$CHART_BUILD_ID" node /build/chart/scripts/bump-chart-engine-build.mjs; \
    fi \
    && npm run build:live:chart \
    && mkdir -p /homepage/public/chart \
    && cp -f /build/chart/legacy-index.html /homepage/public/chart/legacy-index.html \
    && if [ "$CHECKPOINT_BUILD" = "1" ]; then \
      node /build/checkpoint-tools/checkpoint-build-assert.mjs layout \
        --build-id="$CHART_BUILD_ID" \
        --source-sha="$SOURCE_COMMIT_SHA" \
        --chart-root=/build/chart \
        --live-root=/build/talaria-design/live \
        --homepage-chart-root=/homepage/public/chart; \
    fi

FROM node:18-alpine AS builder

WORKDIR /app/homepage

# Skip Next.js telemetry — avoids build-time network calls (a source of TLS-retry
# stalls on the VPS) and shaves time off `next build`.
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=1

# Copy package files
COPY homepage/package*.json ./

# Install dependencies
RUN npm ci

# Homepage app sources
COPY homepage/ ./

# Site-wide limits (imported by src/lib/imageUploadLimits.ts)
COPY shared/constants.json /app/shared/constants.json

# Fresh chart bundle (overwrites committed homepage/public/chart/*)
COPY --from=chart_assets /build/chart/dist-v9 ./public/chart/dist-v9
COPY --from=chart_assets /build/chart/modules ./public/chart/modules
COPY --from=chart_assets /build/chart/chart.js ./public/chart/chart.js
COPY --from=chart_assets /build/chart/multichart-prod ./public/chart/multichart-prod
COPY --from=chart_assets /build/chart/workers ./public/chart/workers
COPY --from=chart_assets /build/chart/vendor ./public/chart/vendor
COPY --from=chart_assets /build/chart/fonts ./public/chart/fonts
COPY --from=chart_assets /build/chart/legacy-index.html ./public/chart/legacy-index.html
COPY --from=chart_assets /build/chart/sw.js ./public/chart/sw.js

# V16 dashboard monolith + score engine (imported by TalariaV16.jsx)
COPY ["Sources Handoff/TalariaV16.jsx", "/app/Sources Handoff/TalariaV16.jsx"]
COPY ["Sources Handoff/scoreEngine.js", "/app/Sources Handoff/scoreEngine.js"]
COPY ["Sources Handoff/metrics/index.js", "/app/Sources Handoff/metrics/index.js"]
COPY ["Sources Handoff/v16AppliedSourceStorage.js", "/app/Sources Handoff/v16AppliedSourceStorage.js"]
# Template storage lives in talaria-design; mirror into handoff for webpack alias at build time.
COPY ["chart v 1.4/talaria-design/src/v9ChartTemplatesStorage.js", "/app/Sources Handoff/v9ChartTemplatesStorage.js"]
COPY ["chart v 1.4/talaria-design/src/v9UiSettingsStorage.js", "/app/Sources Handoff/v9UiSettingsStorage.js"]

# Google Sign-In (same OAuth Web client ID as trading-chart GOOGLE_CLIENT_ID)
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

# Public site URL for Open Graph / link previews (Discord, X, etc.)
ARG NEXT_PUBLIC_SITE_URL=https://www.talaria-log.com
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Never bake a chart API host into the static export. Browser fetches must stay
# same-origin (/api/...) so CSP connect-src 'self' works. A host env like
# NEXT_PUBLIC_CHART_API_ORIGIN=http://x.x.x.x breaks sessions when the user
# opens :3000 or the HTTPS domain (different origin than the baked IP).
ENV NEXT_PUBLIC_CHART_API_ORIGIN=
ENV NEXT_PUBLIC_JOURNAL_API_ORIGIN=

# Client-side error tracking (optional). Empty DSN = Sentry never initializes.
# NEXT_PUBLIC_* must be present at build time to be embedded in the static export.
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE

# Build static export
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

ARG CHECKPOINT_BUILD
ARG CHART_BUILD_ID
ARG SOURCE_COMMIT_SHA
LABEL org.opencontainers.image.revision="${SOURCE_COMMIT_SHA}" \
      io.talaria.checkpoint.build-id="${CHART_BUILD_ID}" \
      io.talaria.checkpoint.strict="${CHECKPOINT_BUILD}"

# Copy built static files
COPY --from=builder /app/homepage/out /usr/share/nginx/html

# Copy nginx config (static /chart/ + tile cache — see nginx.local.conf)
COPY homepage/nginx.local.conf /etc/nginx/conf.d/default.conf
COPY securty/nginx-security-headers.conf /etc/nginx/conf.d/security-headers.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
