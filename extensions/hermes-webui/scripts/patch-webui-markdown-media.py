#!/usr/bin/env python3
"""Durably add authenticated Markdown MEDIA previews to upstream ui.js."""
import sys

MARK = "vulpy-markdown-media-preview"
BRANCH_ANCHOR = "    // HTML files → render inline in sandboxed iframe with lazy-load"
CALL_ANCHOR = "  loadHtmlInline(container);\n"
FUNC_ANCHOR = "// ── HTML inline preview (sandboxed iframe) ─────────────────────────────────\n"
BRANCH = """    // Markdown files → bounded inline preview through native renderMd
    if(/\\.(md|markdown|mdx)$/i.test(ref)){
      const fname=esc(ref.split('/').pop()||ref);
      return `<div class=\"markdown-preview-load\" data-path=\"${esc(ref)}\"><span class=\"markdown-preview-spinner\">⏳</span> Loading Markdown ${fname}...</div>`;
    }
    // HTML files → render inline in sandboxed iframe with lazy-load"""
CALL = "  loadHtmlInline(container);\n  loadMarkdownInline(container);\n"
FUNC = r'''// ── Markdown inline preview (sanitized through native renderMd) ─────────────
function loadMarkdownInline(container){
  const MARKDOWN_MAX_SIZE=256*1024;
  const root=container||document;
  root.querySelectorAll('.markdown-preview-load:not([data-loaded])').forEach(el=>{
    el.setAttribute('data-loaded','1');
    const path=el.dataset.path||'';
    const fname=path.split('/').pop()||path;
    const publicMediaUrl='api/media?path='+encodeURIComponent(path);
    const mediaSessionId=(typeof S!=='undefined'&&S&&S.session&&S.session.session_id)?String(S.session.session_id):'';
    const mediaUrl=publicMediaUrl+(mediaSessionId?'&session_id='+encodeURIComponent(mediaSessionId):'');
    fetch(mediaUrl).then(r=>{if(!r.ok) throw new Error(r.status);return r.text();}).then(markdown=>{
      if(markdown.length>MARKDOWN_MAX_SIZE) throw new Error('too large');
      el.outerHTML=`<details class="markdown-preview-wrap" open><summary>${esc(fname)} · Markdown preview</summary><div class="markdown-preview-body">${renderMd(markdown)}</div></details>`;
    }).catch(()=>{if(el.parentNode) el.outerHTML=`<div class="markdown-preview-fallback"><a class="msg-media-link" href="${publicMediaUrl}&download=1" download="${esc(fname)}">📎 ${esc(fname)}</a><br><span style="color:var(--muted);font-size:12px">Markdown preview unavailable</span></div>`;});
  });
}

'''+FUNC_ANCHOR

def fail(label, path, count):
    print(f"ERROR: {label} anchor count={count} (expected 1) in {path}; upstream shape changed", file=sys.stderr)
    return 1

def main(argv):
    if len(argv)!=2:
        print(f"usage: {argv[0]} /app/hermes-webui/static/ui.js", file=sys.stderr); return 2
    path=argv[1]
    src=open(path).read()
    if MARK in src:
        print(f"already patched — Markdown MEDIA preview present ({path})"); return 0
    if src.count(BRANCH_ANCHOR)!=1: return fail('Markdown branch',path,src.count(BRANCH_ANCHOR))
    if src.count(CALL_ANCHOR)!=1: return fail('Markdown loader call',path,src.count(CALL_ANCHOR))
    if src.count(FUNC_ANCHOR)!=1: return fail('Markdown loader function',path,src.count(FUNC_ANCHOR))
    src=src.replace(BRANCH_ANCHOR, BRANCH, 1)
    src=src.replace(CALL_ANCHOR, CALL, 1)
    src=src.replace(FUNC_ANCHOR, FUNC, 1)
    src=src.replace("// ── Markdown inline preview", "// "+MARK+"\n// ── Markdown inline preview", 1)
    open(path,'w').write(src)
    print(f"  applied: Markdown MEDIA preview ({path})")
    return 0

if __name__=='__main__': sys.exit(main(sys.argv))
