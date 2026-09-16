---
name: vulpy-store-building-core
description: Guide Fox through the complete local store-building workflow.
---

# Build a Store with Fox

Use this skill to guide a customer from an empty Core install to a working
local store.

1. Confirm the workspace and environment configuration.
2. Start PostgreSQL and Redis.
3. Run migrations and the baseline seed.
4. Set the store profile, voice, visual direction, and initial catalog.
5. Add marketing content and media through the supported CMS flow.
6. Verify storefront, cart, checkout, admin, and health routes.
7. Run tests and record any remaining operator actions.

Keep the process incremental and reversible. Do not create staging/live
infrastructure from Core. Never expose secrets or internal Vulpy infrastructure.
