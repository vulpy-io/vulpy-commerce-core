import { describe, expect, it } from "vitest";
import {
  getCategoryImageUrl,
  getCategoryNavAllLabel,
  mapStoreCategoriesToDisplay,
  resolveCategoryImageUrl,
} from "./category-display";

describe("resolveCategoryImageUrl", () => {
  it("returns null for empty values", () => {
    expect(resolveCategoryImageUrl(null)).toBeNull();
    expect(resolveCategoryImageUrl("")).toBeNull();
  });

  it("keeps absolute and storefront asset URLs unchanged", () => {
    expect(resolveCategoryImageUrl("https://example.com/shirts.jpg")).toBe(
      "https://example.com/shirts.jpg"
    );
    expect(resolveCategoryImageUrl("/images/icons/icon-04.svg")).toBe(
      "/images/icons/icon-04.svg"
    );
  });
});

describe("getCategoryNavAllLabel", () => {
  it("returns metadata nav_all_label when set", () => {
    expect(
      getCategoryNavAllLabel({
        name: "Apparel",
        metadata: { nav_all_label: "Shop all" },
      })
    ).toBe("Shop all");
  });

  it("falls back to All [name] when metadata is empty", () => {
    expect(getCategoryNavAllLabel({ name: "Apparel", metadata: {} })).toBe("All Apparel");
    expect(getCategoryNavAllLabel({ name: "", metadata: {} })).toBe("All");
  });
});

describe("getCategoryImageUrl", () => {
  it("returns metadata image_url when set", () => {
    expect(
      getCategoryImageUrl({
        metadata: { image_url: "https://example.com/shirts.jpg" },
      })
    ).toBe("https://example.com/shirts.jpg");
  });

  it("returns null when no image is configured", () => {
    expect(getCategoryImageUrl({ metadata: {} })).toBeNull();
  });
});

describe("mapStoreCategoriesToDisplay", () => {
  it("maps storefront category fields", () => {
    const [category] = mapStoreCategoriesToDisplay([
      {
        id: "pcat_shirts",
        name: "Shirts",
        handle: "shirts",
        metadata: { image_url: "/images/icons/icon-04.svg" },
      },
    ]);

    expect(category).toMatchObject({
      id: 1,
      medusaId: "pcat_shirts",
      title: "Shirts",
      handle: "shirts",
      img: "/images/icons/icon-04.svg",
    });
  });

  it("maps missing images to null", () => {
    const [category] = mapStoreCategoriesToDisplay([
      {
        id: "pcat_pants",
        name: "Pants",
        handle: "pants",
        metadata: {},
      },
    ]);

    expect(category.img).toBeNull();
  });
});
