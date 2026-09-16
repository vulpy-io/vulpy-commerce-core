# HTML design to real storefront workflow

An approved HTML concept is a design reference, not executable storefront content.

1. Inventory the concept into ordered sections, token roles, media, links, data dependencies, and interaction requirements. Read-only.
2. Map every section to an exact existing component/block, an adaptable target, or an explicit unsupported/new-wiring item. “Looks similar” is not a capability match.
3. Apply approved tokens first. Do not paste arbitrary HTML into Payload or silently replace unsupported interactions with decorative markup.
4. Compose the complete ordered block array as one validated checkpoint. Preserve required fields, media relations, product/category references, and order.
5. Render the real route at desktop and mobile sizes. Verify order, computed fonts/colours/spacing, images, links, and no stale/template markers.
6. Use status `ready_to_move_on`, `needs_user_decision`, `works_keep_iterating`, `blocked`, or `failed`. A planner result is not an applied result.

Common failure pattern: mixing HTML inspection, CSS edits, CMS writes, and live verification in one long turn produces a plausible mockup but a broken real homepage. Keep stages separate and make unsupported wiring a user decision.

## Verified typed pipeline implementation (2026-08-30)

Reference implementation: `extensions/hermes-plugins/vulpy-commerce/design_block_pipeline.py`
(tests under `extensions/hermes-plugins/vulpy-commerce/tests/`). Registered as the
`design_block_pipeline` tool; actions `inventory|map|compose|verify|classify`.

- `extract_design_inventory` — parse HTML as inert text (HTMLParser, never execute);
  deterministic ordered sections, tokens, media, links, data deps, interactions.
- `map_capabilities` — exact known/adaptable/unsupported targets; unsupported interactions
  are `blocked`, never approximated.
- `compose_blocks` — complete ordered block array; validates against the block schema
  (mirrors `apps/storefront/src/lib/cms/types.ts`); idempotent; missing required fields fail.
- `verify_render` — section order + required markers + stale-template markers (e.g.
  `Vulpy Design Mockup`, `seed-placeholder`). Currently synthetic-HTML only; live-browser
  render_compare is an explicit gap.
- `classify_handoff` — only the five statuses above.

Known block targets: `hero`, `categoryGrid`, `productGrid`, `richText`, `mediaWithText`,
`newsletter`. Supported interactions: `product-filter`, `email-submit`.

Plugin entry point MUST be `def design_block_pipeline(args: dict, **kwargs)` — see
`hermes-plugin-authoring` for the `task_id`-injection anti-pattern that breaks any
`(args)`-only handler.

Gaps: no live Payload/Medusa writer yet (fail-closed boundary); verify block persistence
with SQL (`pages_blocks_<type>` rows per `_parent_id`) since Payload DROPS blocks that
don't match its schema. Design tokens flow through `store.tokens.json` /
`generate-design.mjs`, never through Payload.
