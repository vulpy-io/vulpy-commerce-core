# Payload REST homepage rebuild — re-runnable recipe (verified 2026-08-11, hectorfinch demo)

End-to-end pattern for rebuilding a Vulpy home page (or any block page) via the Payload
REST API without the admin UI. Used for the Hector Finch editorial redesign round 2
(6 curated category tiles, Lexical craft/showroom copy, footer rebrand, light newsletter).

## Sequence

1. **Login** against the TARGET box's own storefront API:
   ```python
   # creds from the TARGET's apps/storefront/.env (NOT /data/config/<tenant>.env):
   # PAYLOAD_SEED_EMAIL / PAYLOAD_SEED_PASSWORD — admin email is admin@<tenant-domain>
   POST http://127.0.0.1:<shop_port>/api/users/login  {"email","password"} → {token}
   ```
   Auth header: `Authorization: JWT <token>`. Do NOT truncate the login response body
   when parsing the token (a 400-char slice cuts the JWT mid-string → JSONDecodeError).

2. **Read the current doc** (ground truth, includes block ids + numeric media ids):
   ```
   GET /api/pages?where[slug][equals]=home&depth=1&limit=1
   ```
   `depth=1` resolves upload/relationship ids to objects — keep the ids as NUMBERS in
   the write payload (string ids → `invalid relationships: 1032 0` 400).

3. **PATCH the page with the FULL blocks array** (replaces; stale seed blocks like
   countdownPromo/testimonials vanish in the same call). Include the existing block
   `id`s to update in place. Order = rendered order:
   `hero → categoryGrid → productGrid → mediaWithText → cta → mediaWithText → newsletter`.
   - hero: `promos: []` + `badges: []` switches the renderer to the full-bleed variant.
   - categoryGrid: `categoryHandles: [{handle: "…"}, …]` curates tiles via
     `getCategoriesByHandles` (walk parents + children); empty array = top-level groups.
   - mediaWithText `content`: **Lexical `root` JSON** (legacy array renders nothing):
     ```json
     {"root":{"type":"root","format":"","indent":0,"version":1,"direction":"ltr",
       "children":[{"type":"paragraph","format":"","indent":0,"version":1,"direction":"ltr",
         "textFormat":0,"textStyle":"","children":[{"type":"text","format":0,"mode":"normal",
           "style":"","detail":0,"text":"…","version":1}]}],
       "textFormat":0,"textStyle":""}}
     ```
   - newsletter block: OMIT `bgImage` for the light variant (component branches on
     `bgImageUrl` presence).

4. **Globals update via POST** (PATCH → 404 `Route not found`):
   - `POST /api/globals/footer` — full body: `helpTitle`, `preFooterBlocks` (set `[]`
     to remove the OLD dark newsletter), `columns` (title + links[]), `legalLinks`.
   - `POST /api/globals/site-settings` — partial body OK (update merges; unspecified
     fields kept): `contactInfo` {address, phone, email, contactName}, `socialLinks`
     [{platform, url}], `copyright`.
   - Footer left block = `helpTitle` + `siteSettings.contactInfo` + `siteSettings.socialLinks`
     (no "Visit" column needed — that's the left block).

5. **Placeholder pages** for links that must exist before content: `POST /api/pages`
   `{title, slug, layout:"generic", blocks:[]}` → empty shell with header/footer, 200.
   (Used for /our-story, /in-the-press, /faqs, /terms-conditions.)

6. **Verify** on the rendered HTML (curl the shop, grep -F each marker):
   - hero slide titles, curated tile h3s + `01 — <keyword>` kickers, craft/showroom copy
     text (Lexical!), Soane-band cta text, newsletter title, footer column link labels,
     social URLs; stale strings (`Don't Miss Out`, template legal links) ABSENT.
   - Dev mode renders fresh per request; no ISR cache to bust. If the storefront was
     previously 500ing on a Turbopack panic, restart the dev stack first — panics leave
     the compiler wedged and the chown alone does not recover it.

## Pitfalls hit in the field

- Block payload in `pages.content` JSONB is often NULL — don't conclude "no blocks";
  read the `pages_blocks_*` join tables (or the REST doc).
- `docker exec` psql (tenant box, no psql binary): `sudo docker exec -e PGPASSWORD=medusa
  <project>-postgres-1 psql -U medusa -d payload` — container name = compose project.
- Nested quoting (paramiko → sudo → bash -c → psql -c) mangles single quotes; write the
  script to a file on the box (SFTP) and run it, or keep SQL single-quote-free.
