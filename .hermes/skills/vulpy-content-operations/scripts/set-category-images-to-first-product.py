#!/usr/bin/env python3
"""Set every Medusa category's metadata.image_url to its first product's thumbnail (dev).

Usage:
    python3 set-category-images-to-first-product.py [base-url] [email] [password]

Defaults: http://host.docker.internal:9000  admin@example.com  supersecret
Idempotent: merges image_url into existing metadata (seo_* / nav labels survive);
re-runs overwrite the same key. Skips categories with no products or no thumbnail.

Verified 2026-08-08 against dev (Medusa v2.13). See skill references/category-images.md.
"""
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://host.docker.internal:9000"
EMAIL = sys.argv[2] if len(sys.argv) > 2 else "admin@example.com"
PASS = sys.argv[3] if len(sys.argv) > 3 else "supersecret"


def call(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def collect_categories(cats, out):
    for c in cats:
        out[c["id"]] = c
        collect_categories(c.get("category_children") or [], out)


def main():
    token = call("POST", "/auth/user/emailpass", {"email": EMAIL, "password": PASS})["token"]
    tree = call(
        "GET",
        "/admin/product-categories?include_descendants_tree=true&limit=100",
        token=token,
    )
    cats = {}
    collect_categories(tree.get("product_categories", []), cats)

    for cid, cat in cats.items():
        # category_id[] matches DIRECT membership only -> pass descendant scope
        scope = [cid] + [k["id"] for k in cat.get("category_children") or []]
        q = "&".join(f"category_id[]={s}" for s in scope)
        prods = call(
            "GET",
            f"/admin/products?{q}&limit=1&order=-created_at&fields=id,title,thumbnail",
            token=token,
        ).get("products", [])
        if not prods:
            print(f"{cat.get('name')}: no products, skipped")
            continue
        thumb = prods[0].get("thumbnail")
        if not thumb:
            print(f"{cat.get('name')}: first product has no thumbnail, skipped")
            continue
        meta = dict(cat.get("metadata") or {})
        meta["image_url"] = thumb
        # Medusa v2 admin update verb is POST, not PATCH
        updated = call(
            "POST", f"/admin/product-categories/{cid}", {"metadata": meta}, token=token
        )
        got = updated.get("product_category", {}).get("metadata", {}).get("image_url")
        print(f"{cat.get('name')}: image_url={got}")


if __name__ == "__main__":
    main()
