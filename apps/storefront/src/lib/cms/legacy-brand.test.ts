import { describe, expect, it } from "vitest";
import { migrateLegacyPageSeo, replaceLegacyStorefrontBrand } from "./legacy-brand";

describe("replaceLegacyStorefrontBrand", () => {
  it("updates legacy site and SEO titles without changing custom content", () => {
    expect(
      replaceLegacyStorefrontBrand({
        siteName: "Medusa Store",
        defaultSeo: {
          title: "Medusa Store | Medusa Commerce",
          description: "Custom description",
        },
        utilityPageSeo: [
          { route: "/cart", title: "Cart | Medusa Store" },
          { route: "/custom", title: "A custom title" },
        ],
      })
    ).toEqual({
      siteName: "Vulpy Commerce",
      defaultSeo: {
        title: "Vulpy Commerce",
        description: "Custom description",
      },
      utilityPageSeo: [
        { route: "/cart", title: "Cart | Vulpy Commerce" },
        { route: "/custom", title: "A custom title" },
      ],
    });
  });

  it.each([
    "Medusa Store | Medusa Commerce",
    "Vulpy Commerce | Medusa Commerce",
  ])("normalizes the known seeded homepage title %s", (title) => {
    expect(replaceLegacyStorefrontBrand(title)).toBe("Vulpy Commerce");
  });

  it("only replaces Medusa Store inside ordinary strings", () => {
    expect(replaceLegacyStorefrontBrand("Deals at Medusa Store | Custom Partner")).toBe(
      "Deals at Vulpy Commerce | Custom Partner"
    );
  });

  it("is idempotent", () => {
    const branded = { siteName: "Vulpy Commerce", title: "Cart | Vulpy Commerce" };
    expect(replaceLegacyStorefrontBrand(branded)).toEqual(branded);
  });
});

describe("migrateLegacyPageSeo", () => {
  it("transforms only the SEO field while preserving custom page data", () => {
    const page = {
      id: 42,
      slug: "home",
      title: "Custom home",
      blocks: [{ blockType: "hero", title: "Keep me" }],
      seo: {
        title: "Medusa Store | Medusa Commerce",
        description: "Buy from Medusa Store",
      },
    };

    expect(migrateLegacyPageSeo(page)).toEqual({
      changed: true,
      seo: {
        title: "Vulpy Commerce",
        description: "Buy from Vulpy Commerce",
      },
    });
    expect(page.title).toBe("Custom home");
    expect(page.blocks[0].title).toBe("Keep me");
  });

  it("is idempotent and reports custom SEO as unchanged", () => {
    const page = { seo: { title: "Custom title", description: "Custom description" } };
    expect(migrateLegacyPageSeo(page)).toEqual({ changed: false, seo: page.seo });
  });
});
