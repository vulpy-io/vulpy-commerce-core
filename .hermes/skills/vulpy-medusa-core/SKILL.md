---
name: vulpy-medusa-core
description: Help Fox operate the customer's local Medusa commerce backend safely.
---

# Vulpy Medusa Core

Use this skill for the customer's own local Medusa backend and catalog.

- Inspect the local backend and database without exposing secrets.
- Manage products, categories, options, regions, inventory, and basic orders.
- Prefer the application's existing services, workflows, and APIs.
- Use parameterized queries and existing migrations; never edit production data
  directly when a supported workflow exists.
- Run the backend unit tests and typecheck after backend changes.
- Explain migrations, resets, deletes, and seed changes before applying them.
- Keep all host, cloud, gateway, SSH, and private infrastructure details out of
  customer-facing output.

Core is local/dev operation. Production environment lifecycle belongs to the
customer-safe Pro surface, not this skill.
