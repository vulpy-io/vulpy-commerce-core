import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import type { CmsProductContent } from "@/lib/cms/types";
import { getProductModel, getProductSeo } from "./product-seo";

const siteName = "Vulpy Commerce";

describe("getProductModel", () => {
  it("reads model from metadata attributes", () => {
    expect(
      getProductModel({
        attributes: [{ label: "Code", value: "123" }, { label: "Model", value: "Pro V2" }],
      })
    ).toBe("Pro V2");
  });
});

describe("getProductSeo", () => {
  const product = {
    title: "Short marketing name",
    subtitle: "Vendor line",
    description: "Full product description.",
    metadata: {
      attributes: [{ label: "Model", value: "RS-100" }],
    },
  } as unknown as HttpTypes.StoreProduct;

  const productContent = {
    title: "Synced CMS title",
    seo: { title: "", description: "" },
  } as CmsProductContent;

  it("prefers explicit CMS and metadata SEO fields", () => {
    expect(
      getProductSeo(
        product,
        {
          ...productContent,
          seo: { title: "Custom SEO", description: "Custom description" },
        },
        siteName
      )
    ).toEqual({
      title: "Custom SEO | Vulpy Commerce",
      description: "Custom description",
    });

    expect(
      getProductSeo(
        {
          ...product,
          metadata: { ...product.metadata, seo_title: "Meta title", seo_description: "Meta desc" },
        },
        undefined,
        siteName
      )
    ).toEqual({
      title: "Meta title | Vulpy Commerce",
      description: "Meta desc",
    });
  });

  it("defaults the title to the product model field", () => {
    expect(getProductSeo(product, productContent, siteName)).toEqual({
      title: "RS-100 | Vulpy Commerce",
      description: "Vendor line",
    });
  });

  it("falls back to product title when model is unavailable", () => {
    expect(
      getProductSeo(
        {
          ...product,
          metadata: {},
        } as HttpTypes.StoreProduct,
        productContent,
        siteName
      )
    ).toEqual({
      title: "Short marketing name | Vulpy Commerce",
      description: "Vendor line",
    });
  });
});
