# WebUI media serving — corrected contract (2026-08-26)

How files reach the browser in the native (island-disabled) WebUI, and where
the earlier diagnosis of this branch was wrong.

**This branch adds no WebUI server patch, patcher, or Dockerfile wiring for
media serving.** The installed upstream WebUI already provides the handlers;
this branch only guards and documents their contract and changes native
welcome behavior. The precise installed-source evidence is:

- `api/routes.py:12689-12692` dispatches `/api/media` and `/api/file/raw`.
- `api/routes.py:17527` defines `_handle_media`.
- `api/routes.py:17818` defines `_file_raw_target`, including the session-upload
  inbox fallback.
- `api/upload.py:146` defines `_session_attachment_dir`.

These line references are from `/app/hermes-webui` in the installed runtime;
the repository test cross-checks the handler shape when that tree is present.
There is deliberately no server-side change in this branch to keep the fix
limited to the onboarding welcome surface and the media contract guard.

## The three serving paths

| Path | What it serves | Source of truth |
|------|----------------|-----------------|
| `GET /api/media?path=<abs>&session_id=<sid>` | Agent-emitted `MEDIA:<abs-path>` tokens rendered inline in chat | `_handle_media` in `api/routes.py` |
| `POST /api/upload` | Chat attachments; land in a **per-session upload inbox** outside the workspace | `handle_upload` / `_session_attachment_dir` in `api/upload.py` |
| `GET /api/file/raw?session_id=<sid>&path=<rel>` | Workspace-relative files first (`safe_resolve` against the session workspace), then a fallback into **that same per-session upload inbox** | `_file_raw_target` in `api/routes.py` |

Front-end wiring (installed tree):

- `static/ui.js` (~line 14664) builds attachment links as
  `api/file/raw?session_id=…&path=…`.
- `static/workspace.js` (line 266) uses `/api/file/raw` (or
  `/api/escape/file/raw`) for raw file access.
- `MEDIA:` tokens are stashed by `renderMd()` and restored to
  `api/media?path=<ref>` URLs (image cards, SVG/audio/video players, PDF/HTML
  previews, download links).

## Where the early diagnosis was wrong

1. **`GET /api/img` does not exist.** The retired renderer bundle referenced
   it historically; today no emitter or handler exists at HEAD. Any new code
   pointing there 404s silently. Guarded by
   `scripts/tests/hermes-webui-media-contract.test.sh`.
2. **There is no `/session/<sid>/attachments` HTTP route.** An early diagnosis
   assumed uploads were served under such a path. Actual shape: uploads go to
   a per-session *directory* via `_session_attachment_dir(sid)`
   (`HERMES_WEBUI_ATTACHMENT_DIR` root), and they are *served* through
   `/api/file/raw`'s session-inbox fallback with the public URL kept stable.
3. **`/api/media` takes an absolute path, `/api/file/raw` a relative one**,
   and each enforces its own boundary (`allowed_roots` vs
   workspace + own-session inbox). They are not interchangeable.

## Where agent media exports land (D3c audit result)

- **Image-gen tooling** saves generated files under
  `$HERMES_HOME/cache/images/` (`save_b64_image` /
  `save_url_image` in `agent/image_gen_provider.py`). On this box those
  bytes live under `/data/data/hermes/cache/images/` (base home) — verified
  populated by recent `vulpy-image` runs.
- **Profile-isolated agents** keep `$HERMES_HOME` per-profile
  (`/data/data/hermes/profiles/<name>`), but any such path is still nested
  inside the WebUI server's `_HERMES_HOME` allowlist root
  (`/data/data/hermes` — the server process itself runs un-profiled), so
  `/api/media` serves it.
- Even outside all allowlisted roots, an assistant-emitted
  `MEDIA:<path>` matching a file already referenced in the requesting
  session is honored through the session-media-token check
  (`_session_media_token_allows_path`) for images/audio/video/PDF/HTML —
  user-authored tokens never mint entries.

Net: the standard exports are servable today without extra configuration.
Two stability rules worth keeping:

1. Prefer emitting `MEDIA:` paths under the Hermes home (or the session
   workspace) over `/tmp` — `/tmp` is allowlisted but wiped on reboot, so
   old transcripts lose their media either way.
2. Do not add new ad-hoc serving routes; extend `MEDIA_ALLOWED_ROOTS` (env,
   documented in `_handle_media`) if a deployment stores media elsewhere.
