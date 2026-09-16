# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/medusa-backend/package.json apps/medusa-backend/
COPY apps/storefront/package.json apps/storefront/
# ignore-scripts: plugin prepare needs full source (copied in builder); husky is N/A in image
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @apps/medusa-backend... --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/medusa-backend/node_modules ./apps/medusa-backend/node_modules
COPY . .
ARG VITE_MEDUSA_BACKEND_URL=http://localhost:9000
ARG VITE_PAYLOAD_URL=http://localhost:3000
ARG VITE_STOREFRONT_URL=http://localhost:3000
ENV VITE_MEDUSA_BACKEND_URL=$VITE_MEDUSA_BACKEND_URL
ENV VITE_PAYLOAD_URL=$VITE_PAYLOAD_URL
ENV VITE_STOREFRONT_URL=$VITE_STOREFRONT_URL
# Plugin .medusa/server is dockerignored; build it before the backend resolves providers.
RUN pnpm --filter @apps/medusa-backend build && \
    test -f apps/medusa-backend/.medusa/server/public/admin/index.html && \
    mkdir -p apps/medusa-backend/public && \
    rm -rf apps/medusa-backend/public/admin && \
    cp -a apps/medusa-backend/.medusa/server/public/admin apps/medusa-backend/public/admin

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/medusa-backend/node_modules ./apps/medusa-backend/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/medusa-backend ./apps/medusa-backend
COPY scripts/medusa-entrypoint.sh /app/scripts/medusa-entrypoint.sh
RUN chmod +x /app/scripts/medusa-entrypoint.sh

WORKDIR /app/apps/medusa-backend
EXPOSE 9000
ENTRYPOINT ["/app/scripts/medusa-entrypoint.sh"]
