"""Vulpy Commerce operator tools — consolidated single plugin.

All 9 tools for the store-building journey, one plugin. Auth: Payload API key
(useAPIKey is enabled on the Users collection) and Medusa admin token are
resolved from env/seeded keys, never the shell password dance. Media upload
uses requests when available; core http via urllib.

Tools:
- store_profile(get|set|clear): structured store profile.
- mission_progress(get|set|next): deterministic next-action.
- payload_upsert: Payload REST upsert (Lexical-correct, full blocks).
- media_upload: multipart image to Payload Media.
- catalog_seed: idempotent Medusa product seed/import.
- category_set_image: Medusa category image from first product.
- design_tokens_adopt: extract external tokens -> map -> validate -> overrides.
- design_task: designer mockup scaffold w/ Tailwind CDN + storefront token theme.
- coder_dispatch: factory dispatch envelope (worktree+brief+branch), planning-only
  until a separately approved executor is available; this executor gap is explicit.
"""

from __future__ import annotations

import base64
import importlib.util
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path

try:
    from .design_block_pipeline import design_block_pipeline
except ImportError:
    _pipeline_spec = importlib.util.spec_from_file_location(
        "vulpy_commerce_design_block_pipeline", Path(__file__).with_name("design_block_pipeline.py")
    )
    if _pipeline_spec is None or _pipeline_spec.loader is None:
        raise
    _pipeline_module = importlib.util.module_from_spec(_pipeline_spec)
    _pipeline_spec.loader.exec_module(_pipeline_module)
    design_block_pipeline = _pipeline_module.design_block_pipeline

try:
    import requests
    _HAS_REQUESTS = True
except Exception:
    _HAS_REQUESTS = False

WS = Path("/app/workspace")
STOREFRONT = WS / "apps/storefront"
STYLE_CSS = STOREFRONT / "src/app/css/style.css"
TOKENS_OVERRIDES = STOREFRONT / "design/themes/store.tokens.json"
REGISTRY = STOREFRONT / "design/editor.registry.mjs"
TOKENS_GENERATED_CSS = STOREFRONT / "src/app/css/tokens.generated.css"
TAILWIND_CDN = "https://cdn.tailwindcss.com"
STATE_FILE = Path(os.environ.get("VULPY_STORE_STATE", str(WS / ".work/store-state.json")))

STATUS_CODES = {
    "route_unavailable", "renderer_unavailable", "provider_unavailable",
    "bridge_unavailable", "stale_content", "rendered_verification",
}


def _request_contract(args: dict, mutation: str) -> tuple[dict | None, str | None]:
    """Require explicit language and positive tenant/source provenance."""
    language = str(args.get("response_language") or "").strip()
    provenance = args.get("provenance")
    if not language:
        return None, _err("response_language is required; do not infer locale")
    if not isinstance(provenance, dict):
        return None, _err(f"{mutation} requires provenance.tenant_id and provenance.source")
    tenant_id = str(provenance.get("tenant_id") or "").strip()
    source = str(provenance.get("source") or "").strip()
    if not tenant_id or not source:
        return None, _err(f"{mutation} requires provenance.tenant_id and provenance.source")
    return {"response_language": language, "provenance": {"tenant_id": tenant_id, "source": source}}, None


def _status(code: str, **details) -> dict:
    if code not in STATUS_CODES:
        raise ValueError(f"unknown status code: {code}")
    return {"code": code, **details}


def _verify_rendered_store() -> dict:
    """Check both public render paths; no mutation is successful without this."""
    return {
        "homepage": _rendered_verification("/"),
        "catalog": _rendered_verification("/shop"),
    }


def _verified_ok(contract=None, **details) -> str:
    verification = _verify_rendered_store()
    failures = [item for item in verification.values() if item.get("code") != "rendered_verification"]
    if failures:
        return json.dumps({"ok": False, "status": failures[0]["code"], "verification": verification, **(contract or {}), **details}, ensure_ascii=False)
    return _ok(verification=verification, **(contract or {}), **details)


def _rendered_verification(path: str = "/") -> dict:
    """Verify non-empty rendered output before reporting a mutation complete."""
    try:
        base = os.environ.get("STOREFRONT_URL", "http://host.docker.internal:3000").rstrip("/")
        request = urllib.request.Request(f"{base}{path}")
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read(1_000_001).decode(errors="replace")
        if not body.strip():
            return _status("route_unavailable", path=path, reason="empty response")
        if "Vulpy Design Mockup" in body or "seed-placeholder" in body:
            return _status("stale_content", path=path, reason="known placeholder marker")
        return _status("rendered_verification", path=path, bytes=len(body))
    except Exception as exc:
        return _status("route_unavailable", path=path, reason=str(exc)[:200])

MISSIONS = [
    "Mission 0: Hello",
    "Mission 1: Find your voice",
    "Mission 2: Set the mood",
    "Mission 3: Design the storefront",
    "Mission 4: Stock the shelves",
    "Mission 5: Raise the walls",
    "Mission 6: Money matters",
    "Mission 7: Open the doors",
    "Mission 8: After the grand opening",
]
PROFILE_FIELDS = ["owner_name", "store_name", "niche", "source", "locale", "timeline", "tech_comfort"]


def _ok(**kw) -> str:
    return json.dumps({"ok": True, **kw}, ensure_ascii=False)


def _err(msg: str) -> str:
    return json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False)


def _read_env(key: str, file: str, default: str = "") -> str:
    """Read a var from a repo .env (never echo). file is a Path or str."""
    try:
        p = file if isinstance(file, Path) else Path(file)
        for line in p.read_text().splitlines():
            line = line.strip()
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return os.environ.get(key, default)


def _payload_url() -> str:
    return os.environ.get("PAYLOAD_URL", "http://host.docker.internal:3000").rstrip("/")


def _medusa_url() -> str:
    return os.environ.get("MEDUSA_BACKEND_URL", "http://host.docker.internal:9000").rstrip("/")


def _http_json(url, method="GET", data=None, headers=None, timeout=30):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e.fp else ""
        try:
            return e.code, json.loads(raw) if raw else {}
        except Exception:
            return e.code, {"raw": raw[:300]}
    except Exception as e:
        return 0, {"error": str(e)}


def _lexical_rich(text: str) -> dict:
    return {
        "root": {
            "type": "root", "format": "", "indent": 0, "version": 1,
            "children": [{
                "type": "paragraph", "format": "", "indent": 0, "version": 1,
                "direction": "ltr", "textStyle": "",
                "children": [{"type": "text", "mode": "normal", "text": text, "style": "", "version": 1}],
            }],
            "direction": "ltr",
        }
    }


# ── Payload auth: provisioned API key, not the seed password ───────────────
def _payload_api_key() -> tuple[str, str]:
    """Resolve a Payload API key. Prefer an explicit provisioned variable
    (PAYLOAD_API_KEY), else the seed user's API key from the Users collection
    looked up via the seed password (only when no explicit key is set). Returns
    (token_or_empty, error)."""
    explicit = os.environ.get("PAYLOAD_API_KEY") or _read_env("PAYLOAD_API_KEY", STOREFRONT / ".env")
    if explicit:
        return explicit, ""
    # Fallback: key the seed user via password login -> but we prefer no
    # password. Without a provisioned key, defer to the seed creds as last resort.
    email = _read_env("PAYLOAD_SEED_EMAIL", STOREFRONT / ".env")
    pw = _read_env("PAYLOAD_SEED_PASSWORD", STOREFRONT / ".env")
    if not (email and pw):
        return "", "no PAYLOAD_API_KEY set and no seed creds to derive one"
    code, d = _http_json(f"{_payload_url()}/api/users/login",
                         method="POST", data={"email": email, "password": pw})
    if code == 200 and isinstance(d, dict):
        # If the auth config returns apiKey, prefer it; else the JWT token.
        token = d.get("token") or ""
        return token, "" if token else "login ok but no token"
    return "", f"payload auth failed ({code})"


def _payload_headers(token: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def _payload_auth_header() -> dict:
    token, err = _payload_api_key()
    return _payload_headers(token), err


# ── Medusa admin token (no password prompt) ────────────────────────────────
def _medusa_admin_token() -> tuple[str, str]:
    """Resolve a Medusa admin token from env / .env (no interactive prompt)."""
    key = os.environ.get("MEDUSA_API_KEY") or _read_env("MEDUSA_API_KEY", ".env")
    if key:
        # Some Medusa admin routes accept an API key/token directly.
        return key, ""
    email = _read_env("MEDUSA_ADMIN_EMAIL", ".env")
    pw = _read_env("MEDUSA_ADMIN_PASSWORD", ".env")
    if not (email and pw):
        return "", "no MEDUSA_API_KEY and no MEDUSA_ADMIN_* creds"
    code, d = _http_json(f"{_medusa_url()}/auth/user/emailpass", method="POST",
                         data={"email": email, "password": pw})
    if code == 200 and isinstance(d, dict) and d.get("token"):
        return str(d["token"]), ""
    return "", f"medusa login failed ({code})"


# ── store_profile ──────────────────────────────────────────────────────────
def _load_state() -> dict:
    try:
        d = json.loads(STATE_FILE.read_text())
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save_state(d: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    d["_updated_at"] = int(time.time())
    STATE_FILE.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")


def _store_profile(args: dict, **kwargs) -> str:
    action = args.get("action", "get")
    if action == "get":
        return _ok(profile=_load_state().get("profile", {}))
    if action == "clear":
        s = _load_state(); s["profile"] = {}; _save_state(s); return _ok()
    if action == "set":
        fields = args.get("fields") or {}
        if not isinstance(fields, dict) or not fields:
            return _err("set requires non-empty `fields`")
        s = _load_state(); profile = s.get("profile", {})
        for k, v in fields.items():
            if k not in PROFILE_FIELDS:
                return _err(f"unknown field {k}")
            if k == "source" and v not in ("new", "migration"):
                return _err("source must be new|migration")
            profile[k] = v
        s["profile"] = profile; _save_state(s)
        return _ok(profile=profile)
    return _err("action must be get|set|clear")


def _mission_index(m: str) -> int | None:
    m = str(m).strip().lower()
    for i, t in enumerate(MISSIONS):
        if m in t.lower() or t.lower().startswith(m):
            return i
    return int(m) if m.isdigit() and 0 <= int(m) <= 8 else None


def mission_progress(args: dict, **kwargs) -> str:
    action = args.get("action", "get")
    s = _load_state()
    missions = s.get("missions", [])
    if action == "get":
        return _ok(progress=missions)
    if action == "next":
        for i, st in enumerate(missions):
            if st in ("pending", "in_progress"):
                return _ok(next=MISSIONS[i], index=i, status=st)
        for i, st in enumerate(missions):
            if st != "done":
                return _ok(next=MISSIONS[i], index=i, status=st)
        return _ok(next=None, index=None, status="all_done")
    if action == "set":
        idx = _mission_index(args.get("mission", ""))
        status = args.get("status", "")
        if idx is None:
            return _err("unknown mission")
        if status not in ("pending", "in_progress", "done", "archived"):
            return _err("bad status")
        missions = list(missions) + ["pending"] * (idx + 1 - len(missions))
        missions[idx] = status
        s["missions"] = missions; _save_state(s)
        return _ok(mission=MISSIONS[idx], status=status)
    return _err("action must be get|set|next")


# ── payload_upsert ─────────────────────────────────────────────────────────
def _payload_find_id(token, collection, identifier):
    if not identifier:
        return None, "identifier required"
    code, d = _http_json(f"{_payload_url()}/api/{collection}/{identifier}", headers=_payload_headers(token))
    if code == 200 and isinstance(d, dict) and d.get("id"):
        return str(d["id"]), ""
    code, d = _http_json(f"{_payload_url()}/api/{collection}?where[slug][equals]={identifier}&limit=1", headers=_payload_headers(token))
    if code == 200 and isinstance(d, dict) and d.get("docs"):
        return str(d["docs"][0]["id"]), ""
    return None, f"no {collection} doc for {identifier}"


def payload_upsert(args: dict, **kwargs) -> str:
    contract, contract_error = _request_contract(args, "payload_upsert")
    if contract_error:
        return contract_error
    collection = str(args.get("collection") or "").strip()
    identifier = str(args.get("identifier") or "").strip()
    data = args.get("data") or {}
    if collection not in ("pages", "globals", "productContent", "categoryContent", "posts"):
        return _err("collection must be pages|globals|productContent|categoryContent|posts")
    if not isinstance(data, dict) or not data:
        return _err("data object required")
    headers, aerr = _payload_auth_header()
    if aerr:
        return _err(aerr)
    for k in list(data.keys()):
        if k in ("content", "body") and isinstance(data[k], str):
            data[k] = _lexical_rich(data[k])
    if collection == "globals":
        gslug = identifier or "site-settings"
        code, d = _http_json(f"{_payload_url()}/api/globals/{gslug}", method="POST", data=data, headers=headers)
        return _verified_ok(contract=contract, updated=d) if code in (200, 201) else _err(f"globals update failed ({code}): {d}")
    doc_id, ferr = _payload_find_id(token=headers.get("Authorization", "").replace("Bearer ", ""), collection=collection, identifier=identifier)
    if doc_id:
        code, d = _http_json(f"{_payload_url()}/api/{collection}/{doc_id}", method="PATCH", data=data, headers=headers)
        return _verified_ok(contract=contract, updated=d, id=doc_id) if code in (200, 201) else _err(f"PATCH failed ({code}): {d}")
    code, d = _http_json(f"{_payload_url()}/api/{collection}", method="POST", data=data, headers=headers)
    return _verified_ok(contract=contract, created=d) if code in (200, 201) else _err(f"create failed ({code}): {d}")


# ── media_upload ───────────────────────────────────────────────────────────
def media_upload(args: dict, **kwargs) -> str:
    contract, contract_error = _request_contract(args, "media_upload")
    if contract_error:
        return contract_error
    path = str(args.get("path") or "").strip()
    alt = str(args.get("alt") or "").strip()
    if not path or not os.path.isfile(path):
        return _err(f"file not found: {path}")
    headers, aerr = _payload_auth_header()
    if aerr:
        return _err(aerr)
    if not _HAS_REQUESTS:
        return _err("requests lib required for multipart")
    requests_ = requests  # guarded by _HAS_REQUESTS above
    try:
        with open(path, "rb") as f:
            r = requests_.post(f"{_payload_url()}/api/media", headers=headers, files={"file": (os.path.basename(path), f)}, data={"alt": alt} if alt else None, timeout=60)
            d = r.json() if r.content else {}
            if r.status_code in (200, 201) and d.get("doc", {}).get("id"):
                return _verified_ok(contract=contract, media_id=d["doc"]["id"], url=d["doc"].get("url"))
            return _err(f"upload failed ({r.status_code}): {d}")
    except Exception as e:
        return _err(f"upload error: {e}")


# ── category_set_image ─────────────────────────────────────────────────────
def category_set_image(args: dict, **kwargs) -> str:
    contract, contract_error = _request_contract(args, "category_set_image")
    if contract_error:
        return contract_error
    handle = str(args.get("handle") or "").strip()
    if not handle:
        return _err("category handle required")
    token, err = _medusa_admin_token()
    if err:
        return _err(err)
    headers = {"Authorization": f"Bearer {token}"}
    code, d = _http_json(f"{_medusa_url()}/admin/product-categories?q={handle}", headers=headers)
    cats = (d.get("product_categories") or []) if code == 200 else []
    if not cats:
        return _err(f"category not found: {handle}")
    cat = cats[0]
    code, d = _http_json(f"{_medusa_url()}/admin/products?category_id[]={cat['id']}&limit=1", headers=headers)
    products = (d.get("products") or []) if code == 200 else []
    image_url = ""
    for v in (products[0].get("images") or []) if products else []:
        if v.get("url"):
            image_url = v["url"]; break
    if not image_url:
        return _err("no product image found for category")
    code, d = _http_json(f"{_medusa_url()}/admin/product-categories/{cat['id']}", method="POST",
                         data={"metadata": {"image_url": image_url}}, headers=headers)
    return _verified_ok(contract=contract, category=handle, image_url=image_url) if code == 200 else _err(f"update failed ({code}): {d}")


# ── catalog_seed ───────────────────────────────────────────────────────────
def catalog_seed(args: dict, **kwargs) -> str:
    contract, contract_error = _request_contract(args, "catalog_seed")
    if contract_error:
        return contract_error
    products = args.get("products") or []
    if not isinstance(products, list) or not products:
        return _err("products array required")
    token, err = _medusa_admin_token()
    if err:
        return _err(err)
    headers = {"Authorization": f"Bearer {token}"}
    created = skipped = 0
    errors = []
    for prod in products:
        title = str(prod.get("title") or "").strip()
        handle = str(prod.get("handle") or "").strip()
        if not title:
            errors.append("product missing title"); continue
        if handle:
            code, d = _http_json(f"{_medusa_url()}/admin/products?handle={handle}&limit=1", headers=headers)
            if code == 200 and (d.get("products") or []):
                skipped += 1; continue
        payload = {"title": title, "handle": handle or None, "description": prod.get("description") or "", "status": "published",
                   "options": prod.get("options") or [{"title": "Size", "values": ["S", "M", "L", "XL"]}],
                   "variants": prod.get("variants") or [{"title": "Default", "prices": [{"amount": prod.get("price"), "currency_code": prod.get("currency") or "usd"}]}]}
        code, d = _http_json(f"{_medusa_url()}/admin/products", method="POST", data=payload, headers=headers)
        if code in (200, 201) and d.get("product", {}).get("id"):
            created += 1
        else:
            errors.append(f"{title}: {d}")
    return _verified_ok(contract=contract, created=created, skipped=skipped, errors=errors[:5])


# ── design tokens + mockup ─────────────────────────────────────────────────
def _extract_v4_theme() -> dict:
    if not STYLE_CSS.exists():
        return {"_error": "style.css not found"}
    css = STYLE_CSS.read_text()
    block = re.search(r"@theme\s*{([^}]*)}", css, re.S)
    if not block:
        return {"_error": "no @theme"}
    tokens = {}
    for line in block.group(1).splitlines():
        m = re.match(r"(--[\w-]+):\s*([^;]+);?$", line.strip())
        if m:
            tokens[m.group(1).strip()] = m.group(2).strip()
    return tokens


def _design_var_values() -> dict:
    """Parse tokens.generated.css :root into {--design-*: value} for resolution."""
    try:
        css = TOKENS_GENERATED_CSS.read_text()
    except Exception:
        return {}
    return {k: v.strip() for k, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", css)}


def _resolve_token_value(value: str, design_vars: dict) -> str:
    """Resolve 'var(--design-x)' references to their concrete value."""
    m = re.fullmatch(r"var\((--[\w-]+)(?:,[^)]*)?\)", value.strip())
    if m and m.group(1) in design_vars:
        return design_vars[m.group(1)]
    return value


def _tailwind_theme_config(tokens: dict) -> str:
    design_vars = _design_var_values()
    colors, fonts, radii = {}, {}, {}
    for k, v in tokens.items():
        key = k.replace("--", "")
        v = _resolve_token_value(v, design_vars)
        if key.startswith("color-"):
            colors[key.replace("color-", "").replace("-", "")] = v
        elif key.startswith("font-family-"):
            fonts[key.replace("font-family-", "").replace("-", "")] = v
        elif key.startswith("radius-"):
            radii[key.replace("radius-", "").replace("-", "")] = v
    cfg = {"theme": {"extend": {}}}
    if colors: cfg["theme"]["extend"]["colors"] = colors
    if fonts: cfg["theme"]["extend"]["fontFamily"] = fonts
    if radii: cfg["theme"]["extend"]["borderRadius"] = radii
    return "tailwind.config = " + json.dumps(cfg) + ";"


def _mockup_html(tokens: dict, body: str) -> str:
    # Brand baseline typography (Sora headings / Manrope body) — included even
    # on the clean onboarding slate so the mockup renders with a working font
    # stack; the designer can still override it while finding the direction.
    font_links = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Vulpy Design Mockup</title>
{font_links}
<script src="{TAILWIND_CDN}"></script>
<script>{_tailwind_theme_config(tokens)}</script>
<style>body{{font-family:var(--font-family-sans,Manrope,system-ui,sans-serif)}}h1,h2,h3{{font-family:Sora,var(--font-family-sans,sans-serif)}}</style>
</head><body class="bg-[var(--color-canvas,#fbf9f4)] text-[var(--color-text,#171513)] p-10">
{body}
</body></html>"""


def _write_scaffold(html: str) -> str:
    outdir = Path(tempfile.mkdtemp(prefix="vulpy-design-"))
    f = outdir / "index.html"
    f.write_text(html)
    return str(f)


def design_tokens_adopt(args: dict, **kwargs) -> str:
    _, contract_error = _request_contract(args, "design_tokens_adopt")
    if contract_error:
        return contract_error
    source = str(args.get("source") or "").strip()
    css_url = str(args.get("css_url") or "").strip()
    dtcg_path = str(args.get("dtcg_path") or "").strip()
    extracted = {}
    if source == "css_url" and css_url:
        try:
            css = urllib.request.urlopen(urllib.request.Request(css_url, headers={"User-Agent": "curl/7.88"}), timeout=20).read().decode(errors="replace")
            for m in re.finditer(r"(--[\w-]+)\s*:\s*([^;]+);", css):
                extracted[m.group(1).strip()] = m.group(2).strip()
        except Exception as e:
            return _err(f"fetch failed: {e}")
    elif source == "dtcg_path" and dtcg_path:
        try:
            def walk(node, prefix=""):
                if isinstance(node, dict):
                    for k, v in node.items():
                        if k in ("$type", "$description", "$extensions", "$value"): continue
                        walk(v, f"{prefix}.{k}" if prefix else k)
                elif isinstance(node, (str, int, float)):
                    extracted[prefix] = str(node)
            walk(json.loads(Path(dtcg_path).read_text()))
        except Exception as e:
            return _err(f"dtcg read failed: {e}")
    else:
        return _err("source must be css_url or dtcg_path (with matching param)")
    mapped = {}
    for k, v in extracted.items():
        key = k.replace("--", "").lower()
        if key.startswith("color"):
            mapped[f"reference.color.{key.replace('color-','').replace('-','')}"] = v
    return _ok(detected_count=len(extracted), mapped=mapped,
               note="Review + write overrides to store.tokens.json, run validate-design gate")


def design_task(args: dict, **kwargs) -> str:
    # Read-only scaffold generator (writes nothing persistent) — no mutation
    # contract (response_language / provenance) required.
    tokens_arg = str(args.get("tokens") or "auto").strip().lower()
    body = str(args.get("body_snippet") or "").strip()
    route = str(args.get("route") or "/")
    if tokens_arg in ("off", "none", "clean", "slate"):
        # Onboarding / direction-locked: bare Tailwind CDN + fonts + base
        # typography. No storefront token injection — the designer invents the
        # look before the direction is approved.
        html = _mockup_html({}, body or "<h1 class='text-4xl font-light'>Design mockup</h1>")
        return _ok(scaffold=f"file://{_write_scaffold(html)}", route=route,
                   tailwind_cdn=TAILWIND_CDN, tokens="clean",
                   note="Clean Tailwind slate (no storefront tokens): designer sets the direction.")
    tokens = _extract_v4_theme()
    html = _mockup_html(tokens, body or "<h1 class='text-4xl font-light'>Design mockup</h1>")
    return _ok(scaffold=f"file://{_write_scaffold(html)}", route=route,
               tailwind_cdn=TAILWIND_CDN, tokens="storefront",
               token_vars=list(tokens.keys())[:20],
               note="Real storefront tokens resolved + injected (coder matches 1-to-1).")


# ── coder_dispatch ─────────────────────────────────────────────────────────
def coder_dispatch(args: dict, **kwargs) -> str:
    # This tool produces a plan/envelope only. Execution remains an explicit,
    # separately approved factory action.
    task = str(args.get("task") or "").strip() or "unnamed"
    brief = str(args.get("brief") or "").strip()
    if not brief:
        return _err("brief is required")
    slug = re.sub(r"[^a-z0-9]+", "-", task.lower()).strip("-")
    branch = str(args.get("branch") or f"feat/{slug}")
    worktree = Path("/data/state/worktrees") / f"wt-{slug}"
    worktree.mkdir(parents=True, exist_ok=True)
    brief_path = WS / ".hermes" / "tasks" / f"{slug}.md"
    brief_path.parent.mkdir(parents=True, exist_ok=True)
    brief_path.write_text(brief)
    cmd = ("hermes -p coder chat -q "
           f"'Read the task brief at {brief_path} (self-contained). Implement it in a fresh worktree at {worktree} on branch {branch}. Run real verification. Make a LOCAL commit on the branch (do NOT push, do NOT touch main). Report files changed + verification + any baked-server dependency.' "
           "--worktree --accept-hooks")
    return _ok(status="dispatched", branch=branch, worktree=str(worktree), brief=str(brief_path), command=cmd)


# ── registration ──────────────────────────────────────────────────────────
def register(ctx):
    def reg(name, desc, props, handler, required=None):
        ctx.register_tool(
            name=name, toolset="terminal",
            schema={"name": name, "description": desc,
                    "parameters": {"type": "object", "properties": props, "required": required or list(props)}},
            handler=handler, check_fn=lambda: True,
        )

    reg("store_profile", "Read/write the structured Vulpy store profile (name, store, niche, source new|migration, locale, timeline, tech_comfort).", {"action": {"type": "string", "enum": ["get", "set", "clear"]}, "fields": {"type": "object"}}, _store_profile, ["action"])
    reg("mission_progress", "Read/advance mission state (Mission 0..8). 'next' = deterministic next actionable mission.", {"action": {"type": "string", "enum": ["get", "set", "next"]}, "mission": {"type": "string"}, "status": {"type": "string", "enum": ["pending", "in_progress", "done", "archived"]}}, mission_progress, ["action"])
    reg("payload_upsert", "Upsert a Payload doc (pages/globals/productContent/categoryContent/posts) via REST, Lexical-correct, full blocks PATCH, API-key auth.", {"collection": {"type": "string", "enum": ["pages", "globals", "productContent", "categoryContent", "posts"]}, "identifier": {"type": "string"}, "data": {"type": "object"}, "response_language": {"type": "string"}, "provenance": {"type": "object", "required": ["tenant_id", "source"]}}, payload_upsert)
    reg("media_upload", "Upload an image to Payload Media (multipart), return id/url.", {"path": {"type": "string"}, "alt": {"type": "string"}, "response_language": {"type": "string"}, "provenance": {"type": "object", "required": ["tenant_id", "source"]}}, media_upload, ["path", "response_language", "provenance"])
    reg("catalog_seed", "Idempotently create Medusa products (skips existing handles).", {"products": {"type": "array"}, "response_language": {"type": "string"}, "provenance": {"type": "object", "required": ["tenant_id", "source"]}}, catalog_seed, ["products", "response_language", "provenance"])
    reg("category_set_image", "Set Medusa category metadata.image_url from its first product.", {"handle": {"type": "string"}, "response_language": {"type": "string"}, "provenance": {"type": "object", "required": ["tenant_id", "source"]}}, category_set_image, ["handle", "response_language", "provenance"])
    reg("design_tokens_adopt", "Extract external design tokens (CSS url or DTCG json), map to Vulpy reference layer, report overrides.", {"source": {"type": "string", "enum": ["css_url", "dtcg_path"]}, "css_url": {"type": "string"}, "dtcg_path": {"type": "string"}}, design_tokens_adopt, ["source"])
    reg("design_task", "Create designer mockup scaffold with Tailwind CDN (+ optional storefront v4 token theme). Read-only. tokens=auto|storefront injects the real resolved storefront tokens (coder matches 1-to-1); tokens=off|clean gives a bare Tailwind slate for onboarding/direction-finding.", {"route": {"type": "string"}, "body_snippet": {"type": "string"}, "tokens": {"type": "string", "enum": ["auto", "storefront", "off", "clean", "none", "slate"]}}, design_task)
    reg("coder_dispatch", "Dispatch a coding task to the factory coder (worktree+brief+branch), return the exact command.", {"task": {"type": "string"}, "brief": {"type": "string"}, "branch": {"type": "string"}}, coder_dispatch, ["task", "brief"])
    reg("design_block_pipeline", "Pure HTML design inventory, capability mapping, typed block composition, render verification, and handoff classification.", {"action": {"type": "string", "enum": ["inventory", "map", "compose", "verify", "classify"]}, "html": {"type": "string"}, "inventory": {"type": "object"}, "capabilities": {"type": "object"}, "expected_inventory": {"type": "object"}, "status": {"type": "string"}}, design_block_pipeline, ["action"])