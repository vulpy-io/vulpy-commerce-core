import { describe, expect, it } from "vitest";
import { buildCollectionPageJsonLd } from "./structured-data";

const SHOP_PATH_RE = /\/shop$/;

describe("buildCollectionPageJsonLd", () => {
  const base = {
    name: "Shop",
    path: "/shop",
    items: [
      { name: "Tee", path: "/products/tee" },
      { name: "Hoodie", path: "/products/hoodie" },
    ],
  };

  it("uses the clean path as url on page 1", () => {
    const ld = buildCollectionPageJsonLd(base);
    expect(ld["@type"]).toBe("CollectionPage");
    expect(ld.url).toMatch(SHOP_PATH_RE);
  });

  it("self-canonicalizes to ?page=N on deep pages", () => {
    const ld = buildCollectionPageJsonLd({ ...base, page: 3 });
    expect(new URL(ld.url as string).pathname).toBe("/shop");
    expect(new URL(ld.url as string).searchParams.get("page")).toBe("3");
  });

  it("keeps page 1 clean without the query", () => {
    const ld = buildCollectionPageJsonLd({ ...base, page: 1 });
    const url = new URL(ld.url as string);
    expect(url.pathname).toBe("/shop");
    expect(url.search).toBe("");
  });

  it("emits an ItemList of product positions", () => {
    const ld = buildCollectionPageJsonLd(base);
    expect(ld.mainEntity["@type"]).toBe("ItemList");
    expect(ld.mainEntity.itemListElement).toHaveLength(2);
    expect(ld.mainEntity.itemListElement[0].position).toBe(1);
  });
});