# Blog posts (`posts` collection) via Payload REST — re-runnable recipe

Worked 2026-08-12 on a demo shop (3 articles + images, placeholder removal, nav swap).
The API shapes here are Payload-3 template knowledge — they apply to any Vulpy store.

## Create a post

`POST /api/posts` with the seed login from `apps/storefront/.env` (`PAYLOAD_SEED_EMAIL` /
`PAYLOAD_SEED_PASSWORD`, read without echoing):

- **Always send `_status: "published"`** — the `posts` collection has
  `versions: { drafts: true }`, so a create without it stays a draft and never appears
  on the storefront.
- Fields: `title`, `slug`, `excerpt`, `content` (richText → Lexical `root` JSON),
  `featuredImage` (upload → numeric media id), `authorName`, `publishedAt`, `seo` group.
- Featured image: multipart `POST /api/media` first, use the returned numeric id.

## REST response shapes — the mutation already happened when you KeyError

- Collection create/update returns `{"doc": {...}}` — parse `doc`, NOT top-level.
- Global UPDATE returns `{"message", "result"}` — parse `result`.
- Global GET returns the doc top-level (no wrapper).

Wrong key → KeyError, and re-running the script then hits 404s/duplicates on the
already-done parts. Make creates slug-idempotent (skip existing slugs) and tolerate 404
on DELETE of already-removed records.

## Lexical rich articles

Heading, quote (blockquote), bullet/ordered list and inline link nodes all POST fine
with the standard shapes. With a bare `lexicalEditor()` (default features), inline
`upload` image nodes are risky — use ONE `featuredImage` per post instead.

## Removing template seed posts

The NextMerce template ships placeholder posts ("Benefits of regular exercise…",
"How to start a successful e-commerce business") — `DELETE /api/posts/<id>` (admin JWT).
Re-run-safe scripts tolerate 404 here.

## Nav swap to Blog

Replace the item inside the `navigation` global `items[]` and POST the full array
(same pattern as any nav edit). `revalidateSiteGlobal` revalidates `/` layout, so the
new nav renders without restart.

## Verify nav in rendered HTML — escaped-quote trap

The RSC flight payload serializes JSON with escaped quotes, so grep the HTML for
`\"title\":\"Blog\"` / `\"path\":\"/blog\"`, NOT raw `"title":"Blog"` — the raw form
returns false "missing". Footer Company links are NOT the nav: "Our Story" can keep
living in the footer while the header nav is already correct.

## Generic editorial styling convention (flat editorial)

0-radius cards (no `bg-white p-4 shadow-1` chrome), `aspect-[6/7] object-cover` images
with hover zoom (`group-hover:scale-[1.03]` on a `group` article), quiet titles
(`font-normal`), caps micro dates (`text-caps` ~11px, muted,
`toLocaleDateString("en-GB")`), `line-clamp-3` excerpts; article hero =
`aspect-[4/3] object-cover` + caps byline; list section `bg-surface-subtle` (warm)
not `bg-gray-2` (cool). Kill remaining template blues (`.cms-prose` `text-blue-dark`
links etc.) — see `vulpy-design-system-adoption` pitfalls.

## Image pulls from an external brand site

- `browser_console` `Array.from(document.querySelectorAll('img')).map(i => i.currentSrc || i.src)`
  and filter `data:` GIF placeholders.
- **servd-host CDN (`optimise2.`/`cdn2.assets-servd.host`) returns 403 to urllib's
  default User-Agent — always send a browser UA** (`curl -A "Mozilla/5.0 …"` or urllib
  `headers={"User-Agent": …}`); a 403-vs-200 flip on the same URL is UA, not signature
  expiry. (Signed URLs are also query-string-bound — see design-mockups CDN rules.)
- Upload via multipart `POST /api/media` (SVG included), verify with GET on the returned
  `url` — HEAD returns 404 on `/api/media/file/<name>` (Next.js file-route quirk); GET
  is ground truth.