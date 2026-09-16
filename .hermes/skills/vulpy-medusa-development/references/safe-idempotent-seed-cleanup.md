# Safe idempotent cleanup for minimal Medusa seeds

Use this pattern when a default/minimal seed replaces an older fixture-heavy seed and existing databases may still contain the old records.

## Scope contract

- Keep explicit allowlists of legacy product handles, category names/handles, and tag names.
- Never use broad predicates such as “all products”, metadata guesses, prefixes, or titles unless the legacy contract explicitly defines them.
- Preserve separately managed test fixtures (for example, a checkout E2E product) unless repository conventions explicitly classify them as disposable seed data.
- Put cleanup in the default/minimal branch only; `SEED_LEGACY_APPAREL=1` or the equivalent explicit legacy mode must bypass cleanup and run the legacy seeder unchanged.

## Medusa service pattern

1. Resolve `IProductModuleService` from the container.
2. List products with module-service APIs, then filter the returned records against the exact handle allowlist. Medusa filter DTOs can be narrower than the runtime query syntax; avoid forcing unsupported `$in` shapes through TypeScript.
3. Delete matched products in one service call. Product associations should be removed by the module service rather than direct SQL.
4. List categories, filter to exact known names/handles, and delete children before parents. A simple `parent_category_id`-present sort is sufficient when the allowlist is a known legacy tree.
5. List known legacy tags and inspect remaining products with `relations: ["tags"]`. Delete only allowlisted tags that are no longer associated with any product; this protects merchant-owned reuse of generic tag names.
6. Log counts and make each empty-result path a no-op so reseeding is idempotent.

## Tests

Add unit tests that assert:

- Every cleanup target is in the explicit registry.
- The checkout E2E fixture is absent from cleanup targets when it is separately owned.
- The default seed calls cleanup in the non-legacy branch.
- The explicit legacy environment branch still calls the legacy seeder and does not call cleanup.

See this file's companion implementation pattern in the commit that introduced it; tests may be source-contract tests when booting a full Medusa container is inappropriate.
