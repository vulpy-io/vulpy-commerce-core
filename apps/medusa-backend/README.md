# @apps/medusa-backend

Medusa v2 e-commerce backend for the storefront.

## Overview

This is the commerce engine powering the storefront, built with:

- **Medusa v2** – Modern, modular e-commerce framework
- **Admin Dashboard** – Built-in admin UI for managing products, orders, and customers
- **Payload CMS Sync** – Editorial and catalog synchronization with Payload CMS
- **Stripe Payments** – Secure payment processing
- **Medusa Emails** – Built-in email sending service for transactional emails (order confirmations, shipping notifications, newsletter)
- **Cached Queries** – Performance optimization using Medusa's Caching Module for database queries and computed data

## Getting Started

### Prerequisites

- Node.js >= 20
- Docker (for local PostgreSQL via `pnpm db:up` from the repo root)
- Redis (optional, for caching)
- Stripe account

### Environment Variables

Create a `.env` file in this directory (see `.env.template` for reference):

```env
# Database (matches docker-compose.yml)
DATABASE_URL=postgres://medusa:medusa@localhost:5432/medusa

# Redis (optional)
REDIS_URL=

# Security
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret

# Backend URL
MEDUSA_BACKEND_URL=http://localhost:9000

# CORS
STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:9000

# Stripe
STRIPE_API_KEY=

# Medusa Publishable Key (for internal API calls)
MEDUSA_PUBLISHABLE_KEY=

# S3 Storage (optional)
S3_FILE_URL=
S3_REGION=
S3_BUCKET=
S3_ENDPOINT=
```

### Database Setup

From the monorepo root, start PostgreSQL:

```bash
pnpm db:up
```

Run database migrations:

```bash
pnpm medusa db:migrate
```

Seed the database with sample data:

```bash
pnpm seed
```

### Create Admin User

```bash
pnpm add-user
# Creates: admin@example.com / supersecret
```

### Publishable API Key

Writes the seeded publishable key to `apps/storefront/.env`:

```bash
pnpm print-publishable-key
```

Run from this directory, or from the monorepo root:

```bash
pnpm --filter @apps/medusa-backend print-publishable-key
```

### Development

From the monorepo root:

```bash
pnpm dev --filter=@apps/medusa-backend
```

Or from this directory:

```bash
pnpm dev
```

- **Backend API**: [http://localhost:9000](http://localhost:9000)
- **Admin Dashboard**: [http://localhost:9000/app](http://localhost:9000/app)

## Project Structure

```
├── src/
│   ├── admin/
│   │   ├── hooks/          # Admin React hooks
│   │   ├── lib/            # Admin utilities
│   │   ├── routes/         # Custom admin routes
│   │   └── widgets/        # Admin dashboard widgets
│   │
│   ├── api/
│   │   ├── admin/          # Custom admin API routes
│   │   ├── store/          # Custom storefront API routes
│   │   ├── query/          # GraphQL-like query routes
│   │   └── trigger/        # Webhook triggers
│   │
│   ├── modules/
│   │   └── # Custom Medusa modules
│   │
│   ├── subscribers/        # Event subscribers
│   │   ├── newsletter-sub.ts
│   │   ├── order-created.ts
│   │   └── order-shipped.ts
│   │
│   ├── workflows/          # Custom workflows
│   │   └── subscribe-to-newsletter.ts
│   │
│   └── scripts/
│       └── seed.ts         # Database seeding script
│
└── medusa-config.ts        # Medusa configuration
```

## CMS

Content and editorial data are managed in Payload CMS. Medusa-to-Payload sync
commands live in `package.json` and the corresponding scripts under `src/`.

## Scripts

| Script                       | Description                    |
| ---------------------------- | ------------------------------ |
| `pnpm dev`                   | Start development server       |
| `pnpm build`                 | Build for production           |
| `pnpm start`                 | Start production server        |
| `pnpm seed`                  | Seed database with sample data |
| `pnpm add-user`              | Create admin user              |
| `pnpm print-publishable-key` | Write publishable key to storefront `.env` |
| `pnpm test:integration:http` | Run HTTP integration tests     |
| `pnpm test:unit`             | Run unit tests                 |

## API Endpoints

### Store API

Base URL: `http://localhost:9000/store`

Standard Medusa store endpoints plus custom routes in `src/api/store/`.

### Admin API

Base URL: `http://localhost:9000/admin`

Standard Medusa admin endpoints plus custom routes in `src/api/admin/`.

## Useful Links

- [Medusa Documentation](https://docs.medusajs.com/)
- [Medusa v2 Migration Guide](https://docs.medusajs.com/upgrade-guides)
- [Medusa Discord](https://discord.com/invite/medusajs)
