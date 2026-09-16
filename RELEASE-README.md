# Vulpy Commerce Core

**→ [vulpy.io/commerce](https://vulpy.io/commerce)** — product site, docs, and
pricing for Vulpy Commerce editions, add-ons, and the Fox AI operator.

## What it is

Core is the free, public edition of Vulpy Commerce — and it is **an AI-run
shop, not a template**. Core ships with **Fox**, the built-in AI operator
(Hermes agent container + Vulpy WebUI), as the center of the product:

- **Guided setup** — the WebUI welcome flow walks you through bringing the
  store up: storefront, Medusa, database, migrations, seed, admin.
- **Day-to-day operation** — Fox works in the same checkout as you: catalog and
  content, orders, analytics, and shop maintenance through the WebUI's
  side-panel, environment context, and environment-actions features.
- **Missions** — first-boot onboarding and ongoing guided tasks turn "run my
  store" into a managed process.

The Medusa v2 + Next.js + Payload stack underneath is the engine; **Fox is the
driver**. The six WebUI experience features (welcome, side panel, env context,
env actions, profile switcher, core shell) are all part of Core — nothing here
is a paid afterthought.

## Install and run

1. Obtain the Core release tree and verify it using [SIGNING.md](SIGNING.md).
2. Copy `.env.example` to the environment file required by your deployment and
   provide your own secrets and service settings.
3. Start the supplied deployment or development workflow from the release tree.
   Confirm Postgres, Redis, and the application health checks are ready.
4. **Start Fox and open the Vulpy WebUI** (`docker compose -f
   docker-compose.hermes.yml up -d hermes`, WebUI on `:8787`), then complete
   the guided store setup. Never commit credentials or production secrets.

Once bootstrap completes, start the development services:

```bash
pnpm dev

# In another terminal while dev is running:
pnpm --filter @apps/storefront seed   # Payload CMS content
```

Then open **Fox (the Vulpy WebUI)** at `http://localhost:8787`, the storefront
at `http://localhost:3000`, Payload at `http://localhost:3000/admin`, and
Medusa Admin at `http://localhost:9000/app`.

Exact deployment commands depend on the shipped release tree; consult its
included operational files.

## Editions and pricing

- **Core:** free, public edition. Full storefront/Medusa stack + Fox + WebUI.
- **Starter Pack:** $69 list / $49 launch; installable on Core or Pro (search,
  account area, enhanced email, colour swatches/finish facets).
- **Multi-Agent Pack:** $69 list / $49 launch; installable on Core or Pro
  (multi-agent profiles).
- **Pro:** $495/year, private, and includes both add-ons by default.

Core does not include Pro's Payload product/category integration, server
install, or B2B/quote capabilities.

## Security and release verification

Verify `release-manifest.sig` with the shipped `release-public-key.pem`, then
verify every file against `checksums.sha256`. The canonical procedure is in
[SIGNING.md](SIGNING.md). A modified file must be rejected by verification.

## Licensing and legal

Core is distributed under the **Apache License, Version 2.0** (see
[LICENSE](LICENSE)). Third-party components remain governed by their own
licenses; see [NOTICE.md](NOTICE.md).

Vulpy, Inc. · Delaware · 8 The Green Ste D, Dover DE 19901  
Legal: legal@foxinthebox.io · Privacy: privacy@foxinthebox.io
