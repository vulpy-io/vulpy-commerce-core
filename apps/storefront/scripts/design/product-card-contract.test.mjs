import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productCardPath = new URL("../../src/components/Common/ProductItem.tsx", import.meta.url);

test("product card consumes universal component roles, not template color names", async () => {
  const source = await readFile(productCardPath, "utf8");

  for (const legacyClass of ["bg-blue", "bg-white", "text-dark", "text-blue", "text-white", "text-red"]) {
    assert.ok(!source.includes(legacyClass), `${legacyClass} must be replaced with a universal role`);
  }

  for (const semanticClass of [
    "bg-product-card-media-background",
    "bg-product-card-action-background",
    "text-product-card-title",
    "text-product-card-out-of-stock",
  ]) {
    assert.ok(source.includes(semanticClass), `${semanticClass} must be present`);
  }

  assert.ok(source.includes("<article"));
  assert.ok(source.includes("focus-visible:"));
  assert.ok(source.includes("h-11 w-11"));
});
