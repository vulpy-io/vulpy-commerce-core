"""Vulpy Commerce content/catalog tools.

Payload CMS + Medusa catalog operator tools for the store missions. All
idempotent and deterministic — the agent calls these instead of raw curl
recipes.

- payload_upsert: upsert a Payload page/global/productContent/categoryContent
  document with the correct Lexical richText shape, full-blocks PATCH.
- media_upload: multipart-upload an image to Payload Media + verify.
- catalog_seed: idempotently seed/import the Medusa catalog (products,
  variants, prices, categories) from a provided list/spreadsheet/JSON.
- category_set_image: set a Medusa category's image from its first product.

Env: PAYLOAD_SEED_EMAIL/PAYLOAD_SEED_PASSWORD + PAYLOAD URL from
apps/storefront/.env; MEDUSA URL + publishable key. Never echo secrets.
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

try:
    import requests
    _HAS_REQUESTS = True
except Exception:  # pragma: no cover
    _HAS_REQUESTS = False


# ── helpers ────────────────────────────────────────────────────────────────
def _read_storefront_env(key: str, default: str = "") -> str:
    """Read a var from apps/storefront/.env (never echo)."""
    try:
        for line in Path("/app/workspace/apps/storefront/.env").read_text().splitlines():
            line = line.strip()
            if line.startswith(key + "="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                return val
    except Exception:
        pass
    return os.environ.get(key, default)


def _payload_url() -> str:
    # Storefront server is the Payload host. Prefer the running container URL.
    return os.environ.get("PAYLOAD_URL", "http://host.docker.internal:3000").rstrip("/")


def _medusa_url() -> str:
    return os.environ.get("MEDUSA_BACKEND_URL", "http://host.docker.internal:9000").rstrip("/")


def _payload_headers(auth_token: str = "", extra=None) -> dict:
    h = {"Content-Type": "application/json"}
    if auth_token:
        h["Authorization"] = f"Bearer {auth_token}"
    if extra:
        h.update(extra)
    return h


def _payload_login() -> tuple[str, str]:
    """Login to Payload REST; returns (token, error). Never prints secrets."""
    email = _read_storefront_env("PAYLOAD_SEED_EMAIL")
    pw = _read_storefront_env("PAYLOAD_SEED_PASSWORD")
    if not email or not pw:
        return "", "PAYLOAD_SEED_EMAIL/PASSWORD not set in apps/storefront/.env"
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            f"{_payload_url()}/api/users/login",
            data=json.dumps({"email": email, "password": pw}).encode(),
            headers=_payload_headers(),
            method="POST"), timeout=20)
        d = json.loads(r.read().decode())
        token = d.get("token") or (d.get("user") or {}).get("token", "")
        if not token:
            return "", "login ok but no token in response"
        return token, ""
    except Exception as e:
        return "", f"payload login failed: {e}"


def _lexical_rich(text: str) -> dict:
    """Return a Lexical root JSON for a plain text string."""
    return {
        "root": {
            "type": "root",
            "format": "",
            "indent": 0,
            "version": 1,
            "children": [
                {
                    "type": "paragraph",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {"type": "text", "mode": "normal", "text": text, "style": "", "version": 1}
                    ],
                    "direction": "ltr",
                    "textStyle": "",
                }
            ],
            "direction": "ltr",
        }
    }


def _ok(**kw) -> str:
    return json.dumps({"ok": True, **kw}, ensure_ascii=False)


def _err(msg: str) -> str:
    return json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False)


def _http_json(url: str, method: str = "GET", data=None, headers=None, timeout: int = 30):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers=headers or {}, method=method)
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


# ── payload_upsert ─────────────────────────────────────────────────────────
def _payload_find_id(token, collection: str, slug_or_id: str) -> tuple[str | None, str]:
    """Find a Payload doc by slug or id. Returns (id, error)."""
    if not slug_or_id:
        return None, "doc identifier (slug or id) required"
    # try exact id first
    code, d = _http_json(f"{_payload_url()}/api/{collection}/{slug_or_id}",
                         headers=_payload_headers(token))
    if code == 200 and isinstance(d, dict) and d.get("id"):
        return str(d["id"]), ""
    # search by slug where filter applies
    code, d = _http_json(
        f"{_payload_url()}/api/{collection}?where[slug][equals]={slug_or_id}&limit=1",
        headers=_payload_headers(token))
    if code == 200 and isinstance(d, dict) and d.get("docs"):
        return str(d["docs"][0]["id"]), ""
    return None, f"no {collection} doc for {slug_or_id}"


def _payload_upsert(args: dict) -> str:
    collection = str(args.get("collection") or "").strip()
    identifier = str(args.get("identifier") or "").strip()  # slug or id
    data = args.get("data") or {}
    if collection not in ("pages", "globals", "productContent", "categoryContent", "posts"):
        return _err("collection must be pages|globals|productContent|categoryContent|posts")
    if not isinstance(data, dict) or not data:
        return _err("data object required")
    token, err = _payload_login()
    if err:
        return _err(err)
    # Convert plain-text richText fields to Lexical shape where requested.
    for k in list(data.keys()):
        if k in ("content", "body") and isinstance(data[k], str):
            data[k] = _lexical_rich(data[k])
    if collection == "globals":
        gslug = identifier or "site-settings"
        code, d = _http_json(f"{_payload_url()}/api/globals/{gslug}", method="POST",
                             data=data, headers=_payload_headers(token))
        return _ok(updated=d) if code in (200, 201) else _err(f"globals update failed ({code}): {d}")
    doc_id, ferr = _payload_find_id(token, collection, identifier)
    if doc_id:
        code, d = _http_json(f"{_payload_url()}/api/{collection}/{doc_id}", method="PATCH",
                             data=data, headers=_payload_headers(token))
        return _ok(updated=d, id=doc_id) if code in (200, 201) else _err(f"PATCH failed ({code}): {d}")
    # create
    code, d = _http_json(f"{_payload_url()}/api/{collection}", method="POST",
                         data=data, headers=_payload_headers(token))
    return _ok(created=d) if code in (200, 201) else _err(f"create failed ({code}): {d}")


# ── media_upload ───────────────────────────────────────────────────────────
def _media_upload(args: dict) -> str:
    path = str(args.get("path") or "").strip()
    alt = str(args.get("alt") or "").strip()
    if not path or not os.path.isfile(path):
        return _err(f"file not found: {path}")
    token, err = _payload_login()
    if err:
        return _err(err)
    if not _HAS_REQUESTS:
        return _err("requests lib required for multipart upload")
    try:
        with open(path, "rb") as f:
            files = {"file": (os.path.basename(path), f)}
            fields = {}
            if alt:
                fields["alt"] = alt
            r = requests.post(f"{_payload_url()}/api/media", headers={"Authorization": f"Bearer {token}"},
                              files=files, data=fields, timeout=60)
            d = r.json() if r.content else {}
            if r.status_code in (200, 201) and d.get("doc", {}).get("id"):
                doc = d["doc"]
                return _ok(media_id=doc["id"], url=doc.get("url"), filename=doc.get("filename"))
            return _err(f"upload failed ({r.status_code}): {d}")
    except Exception as e:
        return _err(f"upload error: {e}")


# ── category_set_image ─────────────────────────────────────────────────────
def _medusa_admin_token() -> tuple[str, str]:
    """Get a Medusa admin JWT from root .env credentials (never echo)."""
    email = ""
    pw = ""
    try:
        for line in Path("/app/workspace/.env").read_text().splitlines():
            if line.startswith("MEDUSA_ADMIN_EMAIL="): email = line.split("=", 1)[1].strip().strip('"').strip("'")
            if line.startswith("MEDUSA_ADMIN_PASSWORD="): pw = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    if not email or not pw:
        return "", "MEDUSA_ADMIN_EMAIL/PASSWORD not in root .env"
    code, d = _http_json(f"{_medusa_url()}/auth/user/emailpass", method="POST",
                         data={"email": email, "password": pw})
    if code == 200 and isinstance(d, dict) and d.get("token"):
        return str(d["token"]), ""
    return "", f"medusa login failed ({code}): {d}"


def _category_set_image(args: dict) -> str:
    handle = str(args.get("handle") or "").strip()
    if not handle:
        return _err("category handle required")
    token, err = _medusa_admin_token()
    if err:
        return _err(err)
    headers = _payload_headers(token)
    # find category
    code, d = _http_json(f"{_medusa_url()}/admin/product-categories?q={handle}", headers=headers)
    cats = (d.get("product_categories") or []) if code == 200 else []
    if not cats:
        return _err(f"category not found: {handle}")
    cat = cats[0]
    cat_id = cat["id"]
    # first product's thumbnail
    code, d = _http_json(f"{_medusa_url()}/admin/products?category_id[]={cat_id}&limit=1", headers=headers)
    products = (d.get("products") or []) if code == 200 else []
    image_url = ""
    if products:
        image_url = (products[0].get("thumbnail") or "") or ""
        for v in products[0].get("images") or []:
            if v.get("url"):
                image_url = v["url"]
                break
    if not image_url:
        return _err("no product image found for category")
    # write metadata.image_url
    code, d = _http_json(f"{_medusa_url()}/admin/product-categories/{cat_id}", method="POST",
                         data={"metadata": {"image_url": image_url}}, headers=headers)
    return _ok(category=handle, image_url=image_url) if code == 200 else _err(f"update failed ({code}): {d}")


# ── catalog_seed ───────────────────────────────────────────────────────────
def _catalog_seed(args: dict) -> str:
    products = args.get("products") or []
    if not isinstance(products, list) or not products:
        return _err("products array required")
    token, err = _medusa_admin_token()
    if err:
        return _err(err)
    headers = _payload_headers(token)
    created = 0
    skipped = 0
    errors = []
    for prod in products:
        handle = str(prod.get("handle") or "").strip()
        title = str(prod.get("title") or "").strip()
        if not title:
            errors.append("product missing title")
            continue
        # idempotent: skip if handle exists
        if handle:
            code, d = _http_json(f"{_medusa_url()}/admin/products?handle={handle}&limit=1", headers=headers)
            existing = (d.get("products") or []) if code == 200 else []
            if existing:
                skipped += 1
                continue
        price = prod.get("price")
        payload = {
            "title": title,
            "handle": handle or None,
            "description": prod.get("description") or "",
            "status": "published",
            "options": prod.get("options") or [{"title": "Size", "values": ["S", "M", "L", "XL"]}],
            "variants": prod.get("variants") or [{
                "title": "Default",
                "prices": [{"amount": price, "currency_code": prod.get("currency") or "usd"}],
            }],
        }
        code, d = _http_json(f"{_medusa_url()}/admin/products", method="POST",
                             data=payload, headers=headers)
        if code in (200, 201) and d.get("product", {}).get("id"):
            created += 1
        else:
            errors.append(f"{title}: {d}")
    return _ok(created=created, skipped=skipped, errors=errors[:5])


def register(ctx):
    def reg(name, desc, props, handler):
        ctx.register_tool(
            name=name, toolset="terminal",
            schema={"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": list(props)}},
            handler=handler, check_fn=lambda: True,
        )

    reg("payload_upsert", "Upsert a Payload document (pages/globals/productContent/categoryContent/posts) via REST with correct Lexical richText and full-blocks PATCH. Idempotent by slug/id.",
        {"collection": {"type": "string", "enum": ["pages", "globals", "productContent", "categoryContent", "posts"]}, "identifier": {"type": "string", "description": "slug or id, or global slug (e.g. site-settings)"}, "data": {"type": "object", "description": "fields to write; plain-text content/body auto-converted to Lexical"}},
        lambda a, **kw: _payload_upsert(a))
    reg("media_upload", "Upload an image file to Payload Media (multipart) and return its id/url. Verify via the returned URL.",
        {"path": {"type": "string", "description": "absolute path to the image file"}, "alt": {"type": "string", "description": "optional alt text"}},
        lambda a, **kw: _media_upload(a))
    reg("category_set_image", "Set a Medusa category's metadata.image_url from its first product's image (category thumbnails).",
        {"handle": {"type": "string", "description": "category handle"}},
        lambda a, **kw: _category_set_image(a))
    reg("catalog_seed", "Idempotently create Medusa products from a list (title, handle, description, price, currency, options, variants). Skips existing handles. Returns created/skipped/errors.",
        {"products": {"type": "array", "description": "list of product objects"}},
        lambda a, **kw: _catalog_seed(a))