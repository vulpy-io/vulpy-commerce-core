#!/usr/bin/env python3
"""patch-webui-extensions-media-path.py

Native ui.js media restore: serve /extensions/ (and /static/) MEDIA refs
directly instead of routing them through /api/media.

Problem
-------
The native message renderer (static/ui.js) resolves a MEDIA: token by:
  1. https?://(localhost|127.0.0.1) URLs  -> rewritten to the page base
  2. everything else (non-http)           -> 'Local file path' -> api/media?path=...
The WebUI's extension root IS /app/fox-overlay/webui_static (via
HERMES_WEBUI_EXTENSION_DIR), and /extensions/* is served same-origin by
serve_extension_static. But api/media only serves from its allowlisted roots
(hermes home, /tmp, active workspace) — /app/fox-overlay is NOT one, so
routing a /extensions/ ref through api/media returns 404:

  GET /api/media?path=%2Fextensions%2Fimages%2Ffox_avatar_cropped.jpg -> 404

Our message-renderer island already special-cases this (staticAssetUrl
returns the ref itself for /extensions|/static). The native path must match:
virtual static refs are served same-origin directly, exactly like the URL
rewrite branch above.

Injection target (upstream static/ui.js, never rebuilt):
  Anchor: the "Local file path" comment + apiUrl construction
  (``const mediaSessionId=...; const apiUrl='api/media?path='+...``)
  Insert a /extensions|/static branch BEFORE the local-file fallthrough:
  those refs are served directly (src = ref), same as the island.

Idempotent: re-applying replaces the inserted block (guarded by marker).
"""

import sys

TARGET = "/app/hermes-webui/static/ui.js"

OLD = """    // Local file path
    const mediaSessionId=(typeof S!=='undefined'&&S&&S.session&&S.session.session_id)?String(S.session.session_id):'';
    const apiUrl='api/media?path='+encodeURIComponent(ref)+(mediaSessionId?'&session_id='+encodeURIComponent(mediaSessionId):'');"""

NEW = """    // VULPY PATCH MARK: vulpy-extensions-media-path — virtual static assets
    // (/extensions/…, /static/…) are served same-origin directly by the WebUI;
    // routing them through /api/media 404s because they are outside its
    // allowed roots. Mirrors the island renderer's staticAssetUrl.
    if(/^\\/(extensions|static)\\//i.test(ref)){
      const mediaKind=mediaKindForName(ref.split('?')[0]);
      if(mediaKind==='image'){
        return localArtifactCard(ref,ref.split('/').pop()||'image');
      }
      if(_SVG_EXTS.test(ref)){
        return `<img class="msg-media-svg" src="${esc(ref)}" alt="${t('media_svg_label')}" loading="lazy">`;
      }
      if(_AUDIO_EXTS.test(ref)||_VIDEO_EXTS.test(ref)){
        const kind=_AUDIO_EXTS.test(ref)?'audio':'video';
        return _mediaPlayerHtml(kind,ref,ref.split('/').pop()||ref);
      }
      if(_PDF_EXTS.test(ref)){
        return `<div class="pdf-preview-load" data-path="${esc(ref)}"><span class="pdf-preview-spinner">⏳</span> ${t('pdf_loading')} ${esc(ref.split('/').pop()||ref)}...</div>`;
      }
      if(/\\.(md|markdown|mdx)$/i.test(ref)){
        return `<div class="markdown-preview-load" data-path="${esc(ref)}"><span class="markdown-preview-spinner">⏳</span> Loading Markdown ${esc(ref.split('/').pop()||ref)}...</div>`;
      }
      if(_HTML_EXTS.test(ref)){
        return `<div class="html-preview-load" data-path="${esc(ref)}"><span class="html-preview-spinner">⏳</span> ${t('html_loading')}</div>`;
      }
      return `<img class="msg-media-img" src="${esc(ref)}" alt="${esc(ref.split('/').pop()||'image')}" loading="lazy">`;
    }
    // END VULPY PATCH MARK: vulpy-extensions-media-path
    // Local file path
    const mediaSessionId=(typeof S!=='undefined'&&S&&S.session&&S.session.session_id)?String(S.session.session_id):'';
    const apiUrl='api/media?path='+encodeURIComponent(ref)+(mediaSessionId?'&session_id='+encodeURIComponent(mediaSessionId):'');"""


def apply_patch() -> int:
    src = open(TARGET, encoding="utf-8").read()

    if "vulpy-extensions-media-path" in src:
        print(f"{TARGET}: already patched (extensions media path)")
        return 0

    if OLD not in src:
        print(f"{TARGET}: anchor not found", file=sys.stderr)
        return 2
    src = src.replace(OLD, NEW, 1)

    open(TARGET, "w", encoding="utf-8").write(src)

    if "vulpy-extensions-media-path" not in src or "/\\/(extensions|static)\\/" not in src:
        print(f"{TARGET}: post-write verification failed", file=sys.stderr)
        return 2
    print(f"{TARGET}: patched extensions media path (direct same-origin serve)")
    return 0


if __name__ == "__main__":
    sys.exit(apply_patch())