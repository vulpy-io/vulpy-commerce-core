# Rendered UI and seed verification

## Client-only chrome

Some storefront UI is absent from SSR HTML. The mobile burger (`MobileMenu`) is mounted client-side and can be closed by default, so grepping a page dump for its classes proves nothing. Verify it by rendering the real component with `navigationOpen=true` in a Vitest render-contract test, then inspect every `<a>`/`<button>` class and text row. Do the same for overlays when browser access is unavailable.

For live verification, prefer hydrated DOM or the served CSS chunk. A successful HTTP response is not proof that a client-only component or fresh CSS is active.

## Seed convergence

Changing defaults is not enough for an existing Payload database. Seed guards must detect deprecated links/content and explicitly converge or delete them through Payload APIs. After a destructive clean reseed, verify the public Payload globals/collections and Medusa store endpoints, not just the seed exit code.

Use stable URL-safe category handles. If a category was previously seeded under a handle containing `&`, changing the code handle alone leaves the old Medusa record and can produce duplicate categories. The seed must reconcile the existing category's handle and parent, or the cleanup/reseed path must remove the old record. Verify both the canonical route and the old route.

For category thumbnails, set Medusa `metadata.image_url` to real product assets and verify the rendered category response points to existing files. Do not assume a category placeholder image is a valid product thumbnail.

## Search typeahead

When suggestions are fetched successfully but are not visible, inspect the rendered positioning/stacking context: the dropdown must escape clipping, have a higher z-index than the search shell/select, and be anchored to the actual input width. Verify the backend search endpoint separately with the region id; a working endpoint does not prove the overlay is visible. The acceptance chain is: real Medusa `/store/search` hit with region id → hydrated typeahead state → dropdown DOM above the overlay/select stacking context. Stubbed child components only verify the shell.

For sale navigation, require all three live proofs after reseed: `/sale` route returns 200, `sale_only=true` catalog response has `count > 0`, and at least one product exposes original + discounted calculated prices. If the source seed claims sale but the response is empty, treat it as a failed implementation, not a cache footnote; restart the named dev app and re-probe. If the seed writes a deterministic fallback sale marker into product metadata, the shop-catalog index must include metadata and map that marker into `onSale`/discounted price; bump the catalog cache generation when the index contract changes so stale Redis/tiered-cache entries cannot mask the fix.

Top-bar/main-menu corrections are high-signal: a request for a final menu list must be assigned to the surface named by the operator. Never infer that a main-menu list belongs in the utility top bar. After reseed, fetch both Payload globals and assert the exact ordered labels independently.

## Menu hierarchy

Keep first-level, second-level, and third-level menu typography explicit and identical where required. Collapsible parent triggers in mobile should not render the full-width active underline; use a text-width indicator or no underline for those rows. Desktop submenu parents need their own explicit typography rather than inheriting stale smaller submenu classes.

Use one shared SVG chevron for every dropdown direction/state. Preserve the exact path and `transition-transform` class; rotate the SVG with `rotate-180` for open state, rather than replacing it with a CSS border/data-URI arrow. This avoids the recurring “caret points slightly down / double chevrons” regression from overlapping native/custom select indicators. For select controls, ensure only one arrow source is active: either the shared SVG component or the CSS pseudo-element, never both.

Search acceptance must cover geometry as well as data: on desktop constrain the search form to the intended max width, keep the category selector from stretching the bar, and render suggestions above the input with an explicit stacking context/z-index. Verify the open dropdown in the actual component render, not only the successful `/store/search` response.
