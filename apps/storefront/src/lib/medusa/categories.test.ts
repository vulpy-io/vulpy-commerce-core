import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import {
  buildCategoryBreadcrumb,
  buildCategoryNavItems,
  buildCategoryPathTrail,
  buildChildCategoryDisplay,
  buildChildCategoryFacets,
  buildProductBreadcrumbTrail,
  categoryHasProducts,
  getCategoriesByHandles,
  getCategorySeo,
  getDeepestProductCategory,
  getOrderedTopLevelCategories,
  getTopLevelNavCategories,
  mergeNavigationWithCategories,
} from "./categories";

type StoreCategory = HttpTypes.StoreProductCategory;

const apparel = {
  id: "pcat_apparel",
  name: "Apparel",
  handle: "apparel",
  category_children: [
    {
      id: "pcat_shirts",
      name: "Shirts",
      handle: "shirts",
      category_children: [],
    },
    {
      id: "pcat_pants",
      name: "Pants",
      handle: "pants",
      category_children: [],
    },
  ],
} as StoreCategory;

const merch = {
  id: "pcat_merch",
  name: "Merch",
  handle: "merch",
  category_children: [],
} as StoreCategory;

/** 3-level fixture: Apparel → Shirts → (T-Shirts, Button-Downs) */
const deepApparel = {
  id: "pcat_apparel_deep",
  name: "Apparel",
  handle: "apparel",
  category_children: [
    {
      id: "pcat_shirts_deep",
      name: "Shirts",
      handle: "shirts",
      category_children: [
        {
          id: "pcat_tshirts",
          name: "T-Shirts",
          handle: "tshirts",
          category_children: [],
        },
        {
          id: "pcat_button_downs",
          name: "Button-Downs",
          handle: "button-downs",
          category_children: [],
        },
      ],
    },
    {
      id: "pcat_pants_deep",
      name: "Pants",
      handle: "pants",
      category_children: [],
    },
  ],
} as StoreCategory;

describe("categoryHasProducts", () => {
  it("returns true when the category or a descendant has products", () => {
    const productCategoryIds = new Set(["pcat_shirts"]);

    expect(categoryHasProducts(apparel, productCategoryIds)).toBe(true);
    expect(categoryHasProducts(merch, productCategoryIds)).toBe(false);
  });
});

describe("buildCategoryNavItems", () => {
  it("creates dropdowns for parents and links for standalone categories", () => {
    const items = buildCategoryNavItems(
      [apparel, merch],
      new Set(["pcat_shirts", "pcat_merch"]),
      100
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Apparel",
      path: "/categories/apparel",
      submenu: [
        {
          title: "All Apparel",
          path: "/categories/apparel",
          mobileOnly: true,
        },
        {
          title: "Shirts",
          path: "/categories/shirts",
        },
      ],
    });
    expect(items[1]).toMatchObject({
      title: "Merch",
      path: "/categories/merch",
    });
    expect(items[1].submenu).toBeUndefined();
  });

  it("uses metadata nav_all_label for the dropdown all-link when set", () => {
    const apparelWithLabel = {
      ...apparel,
      metadata: { nav_all_label: "Shop all" },
    } as StoreCategory;

    const items = buildCategoryNavItems(
      [apparelWithLabel, merch],
      new Set(["pcat_shirts", "pcat_merch"]),
      100
    );

    expect(items[0].submenu?.[0]).toMatchObject({
      title: "Shop all",
      path: "/categories/apparel",
      mobileOnly: true,
    });
  });

  it("omits categories without products", () => {
    const items = buildCategoryNavItems([apparel, merch], new Set(["pcat_merch"]), 100);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Merch");
  });

  it("does not show child categories as top-level nav items", () => {
    const shirts = {
      ...apparel.category_children[0],
      parent_category_id: "pcat_apparel",
    } as StoreCategory;

    const items = buildCategoryNavItems(
      [apparel, shirts, merch],
      new Set(["pcat_shirts", "pcat_merch"]),
      100
    );

    expect(items.map((item) => item.title)).toEqual(["Apparel", "Merch"]);
    expect(items[0].submenu?.map((item) => item.title)).toContain("Shirts");
  });

  it("builds 3-level nested submenus for grandchild categories", () => {
    const items = buildCategoryNavItems(
      [deepApparel, merch],
      new Set(["pcat_tshirts", "pcat_button_downs", "pcat_merch"]),
      100
    );

    expect(items).toHaveLength(2);

    // Apparel should have a submenu with Shirts and Pants
    expect(items[0].submenu?.map((m) => m.title)).toContain("Shirts");
    expect(items[0].submenu?.map((m) => m.title)).toContain("All Apparel");

    // Shirts should have its own submenu for the grandchildren, with an
    // "All Shirts" entry prepended (same pattern as the 2nd-level "All X").
    const shirts = items[0].submenu?.find((m) => m.title === "Shirts");
    expect(shirts).toBeDefined();
    expect(shirts!.submenu).toBeDefined();
    expect(shirts!.submenu!.map((m) => m.title)).toEqual([
      "All Shirts",
      "T-Shirts",
      "Button-Downs",
    ]);
    expect(shirts!.submenu![0]).toMatchObject({
      title: "All Shirts",
      path: "/categories/shirts",
      mobileOnly: true,
    });

    // Grandchild links should have paths, not "›" labels
    for (const gc of shirts!.submenu!) {
      expect(gc.title).not.toContain("›");
      expect(gc.path).toBeDefined();
    }
  });
});

describe("getTopLevelNavCategories", () => {
  it("keeps only root categories out of a mixed list", () => {
    const shirts = {
      ...apparel.category_children[0],
      parent_category_id: "pcat_apparel",
    } as StoreCategory;

    expect(getTopLevelNavCategories([apparel, shirts, merch]).map((c) => c.name)).toEqual([
      "Apparel",
      "Merch",
    ]);
  });
});

describe("getOrderedTopLevelCategories", () => {
  it("matches navigation order and omits categories without products", () => {
    const productCategoryIds = new Set(["pcat_shirts", "pcat_merch"]);
    const ordered = getOrderedTopLevelCategories(
      [apparel, merch],
      productCategoryIds
    );
    const navItems = buildCategoryNavItems(
      [apparel, merch],
      productCategoryIds,
      100
    );

    expect(ordered.map((category) => category.name)).toEqual(
      navItems.map((item) => item.title)
    );
    expect(ordered.map((category) => category.name)).toEqual(["Apparel", "Merch"]);
  });
});

describe("mergeNavigationWithCategories", () => {
  const custom = [{ id: 1, title: "Contact", path: "/contact", newTab: false }];
  const categories = [{ id: 2, title: "Shirts", path: "/categories/shirts", newTab: false }];

  it("places categories before custom links by default", () => {
    expect(mergeNavigationWithCategories(custom, categories, "before")).toEqual([
      ...categories,
      ...custom,
    ]);
  });

  it("can place categories after custom links or hide them", () => {
    expect(mergeNavigationWithCategories(custom, categories, "after")).toEqual([
      ...custom,
      ...categories,
    ]);
    expect(mergeNavigationWithCategories(custom, categories, "hide")).toEqual(custom);
  });
});

describe("getCategorySeo", () => {
  it("uses CMS SEO title, then description fallbacks", () => {
    expect(
      getCategorySeo(
        {
          name: "Shirts",
          description: "Everyday shirts.",
          metadata: { seo_title: "Shop Shirts", seo_description: "All shirts." },
        } as unknown as StoreCategory,
        "Storefront",
        {
          seo: { title: "CMS Shirts", description: "CMS shirts description." },
        } as never
      )
    ).toEqual({
      title: "CMS Shirts | Storefront",
      description: "CMS shirts description.",
    });
  });

  it("uses category name for title when CMS title is empty", () => {
    expect(
      getCategorySeo(
        {
          name: "Shirts",
          description: "Everyday shirts.",
          metadata: { seo_title: "Shop Shirts", seo_description: "All shirts." },
        } as unknown as StoreCategory,
        "Storefront"
      )
    ).toEqual({
      title: "Shirts | Storefront",
      description: "All shirts.",
    });
  });
});

describe("buildChildCategoryFacets", () => {
  it("returns child categories with scoped product counts", () => {
    const facets = buildChildCategoryFacets(
      apparel,
      [
        {
          categoryIds: ["pcat_shirts"],
          categoryNames: ["Shirts"],
        } as never,
      ],
      new Set(["pcat_shirts"])
    );

    expect(facets).toEqual([{ id: "pcat_shirts", name: "Shirts", products: 1 }]);
  });
});

describe("buildChildCategoryDisplay", () => {
  it("returns visible child categories with storefront image mapping", () => {
    const productCategoryIds = new Set(["pcat_shirts"]);
    const children = buildChildCategoryDisplay(apparel, productCategoryIds);

    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      medusaId: "pcat_shirts",
      title: "Shirts",
      handle: "shirts",
    });
  });
});

describe("buildCategoryBreadcrumb", () => {
  it("includes ancestor categories in the breadcrumb trail", () => {
    const shirts = apparel.category_children[0] as StoreCategory;
    shirts.parent_category = apparel;

    expect(buildCategoryBreadcrumb(shirts)).toEqual([
      { label: "Apparel", href: "/categories/apparel", categoryHandle: "apparel" },
      { label: "Shirts", categoryHandle: "shirts" },
    ]);
  });
});

describe("buildProductBreadcrumbTrail", () => {
  it("uses the deepest assigned category and its ancestors", () => {
    const shirts = apparel.category_children[0] as StoreCategory;
    shirts.parent_category = apparel;

    expect(
      getDeepestProductCategory(
        [{ id: "pcat_merch" }, { id: "pcat_shirts" }],
        [apparel, merch]
      )?.name
    ).toBe("Shirts");

    expect(buildCategoryPathTrail(shirts, [apparel, merch])).toEqual([
      { label: "Apparel", href: "/categories/apparel", categoryHandle: "apparel" },
      { label: "Shirts", href: "/categories/shirts", categoryHandle: "shirts" },
    ]);

    expect(
      buildProductBreadcrumbTrail(
        [{ id: "pcat_shirts" }],
        [apparel, merch],
        "Medusa T-Shirt",
        shirts
      )
    ).toEqual([
      { label: "Apparel", href: "/categories/apparel", categoryHandle: "apparel" },
      { label: "Shirts", href: "/categories/shirts", categoryHandle: "shirts" },
      { label: "Medusa T-Shirt" },
    ]);
  });

  it("resolves parent categories from parent_category_id when tree nesting is flat", () => {
    const protectors = {
      id: "pcat_protectors",
      name: "Protectors",
      handle: "protectors",
      parent_category_id: "pcat_accessories",
      category_children: [],
    } as StoreCategory;

    const accessories = {
      id: "pcat_accessories",
      name: "Accessories",
      handle: "accessories",
      category_children: [],
    } as StoreCategory;

    expect(buildCategoryPathTrail(protectors, [accessories, protectors])).toEqual([
      { label: "Accessories", href: "/categories/accessories", categoryHandle: "accessories" },
      { label: "Protectors", href: "/categories/protectors", categoryHandle: "protectors" },
    ]);
  });

  it("falls back to the product title when no categories match the tree", () => {
    expect(
      buildProductBreadcrumbTrail([], [apparel, merch], "Medusa T-Shirt")
    ).toEqual([{ label: "Medusa T-Shirt" }]);
  });
});

describe("getCategoriesByHandles", () => {
  it("returns curated categories from anywhere in the tree, in tree order", () => {
    const found = getCategoriesByHandles([apparel, merch], [
      "pants",
      "merch",
      "shirts",
    ]);

    expect(found.map((c) => c.handle)).toEqual(["shirts", "pants", "merch"]);
  });

  it("returns each curated handle exactly once from a real-root tree", () => {
    // Fixtures mirror a real-root response: children nested under their parent.
    const ceilingLights = {
      id: "pcat_ceiling_lights",
      name: "Ceiling Lights",
      handle: "ceiling-lights",
      parent_category_id: "pcat_ceiling_and_pendants",
      category_children: [],
    } as StoreCategory;
    const ceilingAndPendants = {
      id: "pcat_ceiling_and_pendants",
      name: "Ceiling & Pendants",
      handle: "ceiling-and-pendants",
      category_children: [ceilingLights],
    } as StoreCategory;
    const wallLights = {
      id: "pcat_wall_lights",
      name: "Wall Lights",
      handle: "wall-lights",
      parent_category_id: "pcat_wall",
      category_children: [],
    } as StoreCategory;
    const wall = {
      id: "pcat_wall",
      name: "Wall",
      handle: "wall",
      category_children: [wallLights],
    } as StoreCategory;

    const found = getCategoriesByHandles([ceilingAndPendants, wall], [
      "ceiling-lights",
      "wall-lights",
      "ceiling-lights",
    ]);

    expect(found.map((c) => c.handle)).toEqual(["ceiling-lights", "wall-lights"]);
  });

  it("returns an empty array when no handles match", () => {
    expect(getCategoriesByHandles([apparel, merch], ["does-not-exist"])).toEqual(
      []
    );
  });
});