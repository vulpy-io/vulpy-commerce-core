import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveMedusaAssetUrl } from "./asset-url";

describe("resolveMedusaAssetUrl", () => {
  const originalAssetUrl = process.env.NEXT_PUBLIC_MEDUSA_ASSET_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_MEDUSA_ASSET_URL = "https://api.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_MEDUSA_ASSET_URL = originalAssetUrl;
  });

  it("returns null for empty values", () => {
    expect(resolveMedusaAssetUrl(null)).toBeNull();
    expect(resolveMedusaAssetUrl("")).toBeNull();
  });

  it("keeps storefront asset paths unchanged", () => {
    expect(resolveMedusaAssetUrl("/images/icons/icon-04.svg")).toBe(
      "/images/icons/icon-04.svg"
    );
    expect(resolveMedusaAssetUrl(PRODUCT_PLACEHOLDER_IMAGE)).toBe(
      PRODUCT_PLACEHOLDER_IMAGE
    );
  });

  it("rewrites absolute storefront image URLs to local paths", () => {
    expect(
      resolveMedusaAssetUrl(
        "http://localhost:3000/images/demo/product-a.jpg"
      )
    ).toBe("/images/demo/product-a.jpg");
    expect(
      resolveMedusaAssetUrl("https://shop.example.com/images/demo/hero.jpg")
    ).toBe("/images/demo/hero.jpg");
  });

  it("prefixes /static paths with the public API origin", () => {
    expect(resolveMedusaAssetUrl("/static/foo.webp")).toBe(
      "https://api.example.com/static/foo.webp"
    );
  });

  it("rewrites legacy absolute localhost static URLs", () => {
    expect(
      resolveMedusaAssetUrl("http://localhost:9000/static/foo.webp")
    ).toBe("https://api.example.com/static/foo.webp");
  });

  it("passes through external HTTPS URLs", () => {
    expect(resolveMedusaAssetUrl("https://cdn.example.com/foo.webp")).toBe(
      "https://cdn.example.com/foo.webp"
    );
  });
});
