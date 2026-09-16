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
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @apps/storefront...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/storefront/node_modules ./apps/storefront/node_modules
COPY . .
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ARG NEXT_PUBLIC_MEDUSA_ASSET_URL=http://localhost:9000
ARG MEDUSA_PUBLISHABLE_KEY=
ARG PAYLOAD_SECRET=build-placeholder
ARG NEXT_PUBLIC_STRIPE_KEY=
ARG NEXT_PUBLIC_ENABLE_CUSTOMER_ACCOUNTS=true
ARG REQUIRE_LOGIN_FOR_PRICES=false
ARG PRICE_GATE_MODE=off
ARG NEXT_PUBLIC_MATOMO_URL=
ARG NEXT_PUBLIC_MATOMO_SITE_ID=
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_MEDUSA_ASSET_URL=$NEXT_PUBLIC_MEDUSA_ASSET_URL
ENV MEDUSA_PUBLISHABLE_KEY=$MEDUSA_PUBLISHABLE_KEY
ENV PAYLOAD_SECRET=$PAYLOAD_SECRET
ENV NEXT_PUBLIC_STRIPE_KEY=$NEXT_PUBLIC_STRIPE_KEY
ENV NEXT_PUBLIC_ENABLE_CUSTOMER_ACCOUNTS=$NEXT_PUBLIC_ENABLE_CUSTOMER_ACCOUNTS
ENV REQUIRE_LOGIN_FOR_PRICES=$REQUIRE_LOGIN_FOR_PRICES
ENV PRICE_GATE_MODE=$PRICE_GATE_MODE
ENV NEXT_PUBLIC_MATOMO_URL=$NEXT_PUBLIC_MATOMO_URL
ENV NEXT_PUBLIC_MATOMO_SITE_ID=$NEXT_PUBLIC_MATOMO_SITE_ID
ENV PAYLOAD_DATABASE_URL=postgres://medusa:medusa@localhost:5432/payload
RUN pnpm --filter @apps/storefront build

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/storefront/.next/standalone ./
COPY --from=builder /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=builder /app/apps/storefront/public ./apps/storefront/public
COPY --from=builder /app/apps/storefront/src/migrations ./apps/storefront/src/migrations
COPY --from=builder /app/apps/storefront/scripts/run-payload-migrate.mjs ./apps/storefront/scripts/run-payload-migrate.mjs
COPY --from=builder /app/apps/storefront/payload.config.ts ./apps/storefront/payload.config.ts
COPY --from=builder /app/apps/storefront/payload.migrate.config.ts ./apps/storefront/payload.migrate.config.ts
COPY --from=builder /app/apps/storefront/tsconfig.json ./apps/storefront/tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/storefront/package.json ./apps/storefront/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/storefront/node_modules ./apps/storefront/node_modules
COPY scripts/storefront-entrypoint.sh /app/scripts/storefront-entrypoint.sh
RUN chmod +x /app/scripts/storefront-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/scripts/storefront-entrypoint.sh"]
