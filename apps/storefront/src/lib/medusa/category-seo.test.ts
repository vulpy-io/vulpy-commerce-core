import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import type { CmsCategoryContent } from "@/lib/cms/types";
import { getCategoryHeading, getCategorySeo, getPseudoCategoryHeading, getPseudoCategorySeo } from "./category-seo";

const siteName = "Vulpy Commerce";

describe("getPseudoCategorySeo", () => {
  it("prefers CMS SEO fields and appends site name", () => {
    expect(
      getPseudoCategorySeo(
        {
          seo: { title: "Sale SEO", description: "Sale description" },
        } as CmsCategoryContent,
        siteName,
        { title: "Sale", description: "Fallback description" }
      )
    ).toEqual({
      title: "Sale SEO | Vulpy Commerce",
      description: "Sale description",
    });
  });

  it("falls back to h1 then category title", () => {
    expect(
      getPseudoCategorySeo(
        { h1: "Sale H1", title: "Sale" } as CmsCategoryContent,
        siteName,
        { title: "Sale", description: "Discounted products" }
      )
    ).toEqual({
      title: "Sale H1 | Vulpy Commerce",
      description: "Discounted products",
    });

    expect(
      getPseudoCategorySeo(null, siteName, {
        title: "Sale",
        description: "Discounted products",
      })
    ).toEqual({
      title: "Sale | Vulpy Commerce",
      description: "Discounted products",
    });
  });
});

describe("getPseudoCategoryHeading", () => {
  it("prefers CMS h1 override", () => {
    expect(
      getPseudoCategoryHeading(
        { h1: "Big sale", title: "Sale" } as CmsCategoryContent,
        "Sale"
      )
    ).toBe("Big sale");
  });
});

describe("getCategoryHeading", () => {
  const category = {
    name: "Rackets",
    handle: "rackets",
  } as HttpTypes.StoreProductCategory;

  it("prefers CMS h1 override", () => {
    expect(
      getCategoryHeading(category, {
        h1: "Custom heading",
        title: "Synced title",
      } as CmsCategoryContent)
    ).toBe("Custom heading");
  });

  it("falls back to Medusa category name", () => {
    expect(getCategoryHeading(category, null)).toBe("Rackets");
  });
});

describe("getCategorySeo", () => {
  const category = {
    name: "Rackets",
    description: "Category description.",
    metadata: { seo_title: "Meta title", seo_description: "Meta description" },
  } as unknown as HttpTypes.StoreProductCategory;

  it("prefers CMS SEO fields and appends site name", () => {
    expect(
      getCategorySeo(category, siteName, {
        seo: { title: "CMS title", description: "CMS description" },
      } as CmsCategoryContent)
    ).toEqual({
      title: "CMS title | Vulpy Commerce",
      description: "CMS description",
    });
  });

  it("falls back to h1 then category name", () => {
    expect(
      getCategorySeo(category, siteName, {
        h1: "CMS H1",
        title: "Synced title",
        seo: { title: "", description: "" },
      } as CmsCategoryContent)
    ).toEqual({
      title: "CMS H1 | Vulpy Commerce",
      description: "Meta description",
    });
  });

  it("falls back to category name without CMS content", () => {
    expect(getCategorySeo(category, siteName)).toEqual({
      title: "Rackets | Vulpy Commerce",
      description: "Meta description",
    });
  });

  it("uses category name when metadata title is set but CMS is absent", () => {
    expect(
      getCategorySeo(
        {
          ...category,
          metadata: {},
        } as HttpTypes.StoreProductCategory,
        siteName
      )
    ).toEqual({
      title: "Rackets | Vulpy Commerce",
      description: "Category description.",
    });
  });
});
