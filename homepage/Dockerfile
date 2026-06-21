# Homepage - Next.js Static Build
# Build context = repository root (see docker-compose.yml) so TalariaV16.jsx is available
# at ../Sources Handoff relative to this folder (webpack alias in next.config.mjs).
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

# V16 dashboard monolith + score engine (imported by TalariaV16.jsx)
COPY ["Sources Handoff/TalariaV16.jsx", "/app/Sources Handoff/TalariaV16.jsx"]
COPY ["Sources Handoff/scoreEngine.js", "/app/Sources Handoff/scoreEngine.js"]
# Template storage lives in talaria-design; mirror into handoff for webpack alias at build time.
COPY ["chart v 1.4/talaria-design/src/v9ChartTemplatesStorage.js", "/app/Sources Handoff/v9ChartTemplatesStorage.js"]

# Google Sign-In (same OAuth Web client ID as trading-chart GOOGLE_CLIENT_ID)
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

# Public site URL for Open Graph / link previews (Discord, X, etc.)
ARG NEXT_PUBLIC_SITE_URL=https://www.talaria-log.com
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Build static export
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built static files
COPY --from=builder /app/homepage/out /usr/share/nginx/html

# Copy nginx config (static /chart/ + tile cache — see nginx.local.conf)
COPY homepage/nginx.local.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
