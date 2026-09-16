# Uploading media to Payload from Fox (REST)

No browser/admin needed — drive the Payload REST API from the container. Verified 2026-08-08
against dev storefront (`http://host.docker.internal:3000`).

## Steps

1. Read `PAYLOAD_SEED_EMAIL` / `PAYLOAD_SEED_PASSWORD` from `apps/storefront/.env` **without
   echoing them** (source into shell vars; print only non-secret results).
2. **Login:** `curl -s -c /tmp/payload-cookies.txt -H "Content-Type: application/json" \
   -d '{"email":"$EMAIL","password":"$PASS"}' http://host.docker.internal:3000/api/users/login`
   → `{"user": {...}, "message": "Authentication Passed"}`.
3. **Upload:** `curl -s -b /tmp/payload-cookies.txt \
   -F "file=@/path/file.svg;type=image/svg+xml" -F "alt=..." \
   http://host.docker.internal:3000/api/media`
   → response `doc.id`, `doc.filename`, `doc.url`.
4. **Verify:** GET `http://host.docker.internal:3000<doc.url>` → 200 + correct content-type.
   ⚠️ HEAD returns **404** on `/api/media/file/<name>` (Next.js file-route quirk) — GET is the
   ground truth, not HEAD.
5. Media collection accepts `image/*` and `video/*`; `imageSizes` generate thumbnail/card/tablet
   for raster images. SVGs upload as-is (no resizing). The `revalidateMedia` afterChange hook
   fires automatically.

## Grabbing a logo from a marketing site (e.g. meetvulpy.com)

The meetvulpy.com header logo is an **inline SVG in the page HTML**, not a downloadable file:

1. `curl -sL -A "Mozilla/5.0 ..." https://meetvulpy.com/` → extract `<svg ...>...</svg>` from the
   header (regex `<svg width="149".*?</svg>`).
2. The SVG references theme CSS variables (`fill="var(--theme-text)"`, `var(--theme-bg)`).
   Fetch the theme stylesheet (`.../wp-content/themes/vulpy/assets/dist/css/main-*.css`) and read
   the `:root` block to resolve values (default light mode: `--theme-text: #161A14`,
   `--theme-bg: #FAFCF0`). Bake the concrete hex values in — an unrendered `var()` makes fills
   fall back to black outside the site's theme.
3. Clean the SVG: strip Tailwind `class` attrs, keep the inline `<defs>` gradient, ensure exactly
   ONE `xmlns` attribute (a duplicate makes the SVG invalid XML).
4. Upload via step 3 with `type=image/svg+xml`.
