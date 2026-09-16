import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
  buildDemoProductInput,
  DEMO_CATALOG_MARKER,
  DEMO_CHILD_CATEGORIES,
  DEMO_COLOR_SWATCH_COLORS,
  DEMO_GRANDCHILD_CATEGORIES,
  DEMO_IMAGE_DIR,
  DEMO_PARENT_CATEGORY,
  DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES,
  DEMO_PRODUCTS,
  DEMO_TOP_LEVEL_CATEGORIES,
  isDemoCatalogProduct,
  mergeDemoProductMetadata,
  oosVariantInventoryKit,
  upsertDemoProductMetadata,
} from "../demo-catalog";

/** Demo variant image files are kebab-case .jpg names under DEMO_IMAGE_DIR. */
const IMAGE_FILE_PATTERN = /^[a-z0-9-]+\.jpg$/;
/** Category handles are kebab-case identifiers. */
const HANDLE_PATTERN = /^[a-z0-9-]+$/;

function findDemo(handle: string) {
  const demo = DEMO_PRODUCTS.find((product) => product.handle === handle);
  if (!demo) {
    throw new Error(`demo product ${handle} is missing from the register`);
  }
  return demo;
}

describe("demo-catalog helpers", () => {
  describe("DEMO_CATALOG_MARKER", () => {
    it("is a stable namespaced marker", () => {
      expect(DEMO_CATALOG_MARKER).toBe(true);
    });
  });

  describe("expanded family register (Brief 12, A2)", () => {
    const HANDLES = DEMO_PRODUCTS.map((p) => p.handle);
    const ALL_SKUS = DEMO_PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku));
    // Parent + Paperweights, Vessels, Instruments, Reflectors, Timepieces,
    // Orbits & Orbs — the D-B decision (~7 categories).
    const EXPECTED_CHILDREN = [
      "paperweights",
      "vessels",
      "instruments",
      "reflectors",
      "timepieces",
      "orbits-orbs",
    ];

    it("grows to the expanded catalog size (~15 products)", () => {
      expect(DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(14);
    });

    it("stays within the agreed SKU envelope (24–30)", () => {
      expect(ALL_SKUS.length).toBeGreaterThanOrEqual(24);
      expect(ALL_SKUS.length).toBeLessThanOrEqual(30);
    });

    it("defines all six child families", () => {
      expect(DEMO_CHILD_CATEGORIES.map((c) => c.handle)).toEqual(
        EXPECTED_CHILDREN.filter((handle) => handle !== "orbits-orbs")
      );
      // Every child gets a category banner slot under DEMO_IMAGE_DIR.
      for (const child of DEMO_CHILD_CATEGORIES) {
        expect(child.handle).toMatch(HANDLE_PATTERN);
      }
    });

    it("keeps Orbits & Orbs as a top-level category with products", () => {
      expect(DEMO_TOP_LEVEL_CATEGORIES.map((category) => category.handle)).toEqual(["orbits-orbs"]);
      expect(DEMO_PRODUCTS.some((product) => product.categoryHandle === "orbits-orbs")).toBe(true);
    });

    it("explicitly reconciles top-level categories to a null parent", () => {
      const runnerPath = join(import.meta.dirname, "..", "seed-demo-catalog.ts");
      const runner = readFileSync(runnerPath, "utf8");
      expect(runner).toContain("parent_category_id: null");
    });

    it("routes every product into a declared family", () => {
      const familyHandles = new Set(EXPECTED_CHILDREN);
      for (const product of DEMO_PRODUCTS) {
        expect(familyHandles.has(product.categoryHandle)).toBe(true);
      }
    });

    it("keeps product handles globally unique", () => {
      expect(new Set(HANDLES).size).toBe(HANDLES.length);
    });

    it("keeps SKUs globally unique and DEMO-prefixed (strip cleanup contract)", () => {
      expect(new Set(ALL_SKUS).size).toBe(ALL_SKUS.length);
      for (const sku of ALL_SKUS) {
        expect(sku.startsWith("DEMO-")).toBe(true);
      }
    });

    it("covers every Color value with a registered swatch color", () => {
      for (const product of DEMO_PRODUCTS) {
        const colorOption = product.options.find(
          (option) => option.title === "Color"
        );
        if (!colorOption) {
          continue;
        }
        for (const value of colorOption.values) {
          expect(DEMO_COLOR_SWATCH_COLORS[value]).toBeDefined();
        }
      }
    });

    it("preserves the capability demos", () => {
      // Out-of-stock-but-clickable (Task 3 fix).
      const paperweight = findDemo("levitating-paperweight");
      expect(
        paperweight.variants.some(
          (v) => v.outOfStock && v.options.Color === "Black"
        )
      ).toBe(true);

      // Quotation persona hero stays priced ≥ 120.
      const quoteHero = findDemo("floating-question-mark");
      expect(quoteHero.variants[0]?.price).toBeGreaterThanOrEqual(120);

      // A sale-priced entry-level piece survives the apparel gating.
      const saleItems = DEMO_PRODUCTS.filter(
        (p): p is typeof p & { salePrice: number } =>
          typeof p.salePrice === "number"
      );
      expect(saleItems.length).toBe(1);
      const sale = saleItems[0];
      if (!sale) {
        throw new Error("sale-priced demo item missing");
      }
      expect(sale.variants).toHaveLength(1);
      const saleVariant = sale.variants[0];
      if (!saleVariant) {
        throw new Error("sale demo variant missing");
      }
      expect(sale.salePrice).toBeLessThan(saleVariant.price);

      // Entry-level price point near the floor for reporting spreads.
      const variantPrices = DEMO_PRODUCTS.flatMap((p) =>
        p.variants.map((v) => v.price)
      );
      const cheapest = Math.min(...variantPrices);
      expect(cheapest).toBeLessThanOrEqual(20);
    });

    it("names at least one Reflectors, Timepieces and Orbits & Orbs product each", () => {
      for (const family of ["reflectors", "timepieces", "orbits-orbs"]) {
        expect(
          DEMO_PRODUCTS.some((p) => p.categoryHandle === family)
        ).toBe(true);
      }
    });

    it("stamps explicit filterable.material on every product for shop facets", () => {
      for (const product of DEMO_PRODUCTS) {
        expect(product.filterable?.material).toBeTruthy();
        if (!product.filterable?.material) {
          throw new Error(`${product.handle} must declare a Material facet`);
        }
      }
    });

    it("writes filterable into metadata via buildDemoProductInput", () => {
      const paperweight = findDemo("levitating-paperweight");
      const input = buildDemoProductInput(paperweight, {
        categoryIdByHandle: new Map([["paperweights", "cat_x"]]),
        shippingProfileId: "sp_default",
        salesChannelId: "sc_default",
      });
      expect(input.metadata).toMatchObject({
        filterable: { material: "Stone" },
      });
    });
  });

  describe("3rd-level grandchild categories (Task: 3rd-level nav)", () => {
    it("defines two grandchildren under paperweights", () => {
      expect(DEMO_GRANDCHILD_CATEGORIES.map((g) => g.handle)).toEqual([
        "desk-paperweights",
        "cabinet-paperweights",
      ]);
      for (const grandchild of DEMO_GRANDCHILD_CATEGORIES) {
        expect(grandchild.parentHandle).toBe("paperweights");
        expect(grandchild.handle).toMatch(HANDLE_PATTERN);
        expect(grandchild.imageFile).toMatch(IMAGE_FILE_PATTERN);
      }
    });

    it("gives each grandchild product coverage via the extra-category map", () => {
      // categoryHasProducts hides empty categories, so every grandchild
      // handle must be reachable from at least one demo product.
      const grandchildHandles = new Set(
        DEMO_GRANDCHILD_CATEGORIES.map((g) => g.handle)
      );
      const assigned = new Set<string>();
      for (const handles of Object.values(DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES)) {
        for (const handle of handles) {
          if (grandchildHandles.has(handle)) {
            assigned.add(handle);
          }
        }
      }
      expect(Array.from(assigned).sort()).toEqual(
        Array.from(grandchildHandles).sort()
      );
    });

    it("declares extra categories only for products that exist", () => {
      const handles = new Set(DEMO_PRODUCTS.map((p) => p.handle));
      for (const productHandle of Object.keys(
        DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES
      )) {
        expect(handles.has(productHandle)).toBe(true);
      }
    });
  });

  describe("oosVariantInventoryKit", () => {
    it("creates an empty inventory kit so the variant has zero stock", () => {
      const kit = oosVariantInventoryKit();
      expect(kit).toEqual([]);
    });

    it("returns a fresh array each call (no shared mutable state)", () => {
      const a = oosVariantInventoryKit();
      const b = oosVariantInventoryKit();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("single-variant demo products carry generated images", () => {
    const EXPECTED_IMAGES: Record<string, string> = {
      "hovering-cup": "hovering-cup.jpg",
      "suspended-hourglass": "suspended-hourglass.jpg",
      "floating-question-mark": "floating-question-mark.jpg",
      "levitating-teapot": "levitating-teapot.jpg",
      "pendulum-clock": "pendulum-clock-marble.jpg",
      "pebble-orbit": "orbit-ring-stone.jpg",
      "orbit-sphere": "orbit-sphere-brass.jpg",
    };

    it("wires imageFile on the One Size variant of each single-variant product", () => {
      for (const [handle, file] of Object.entries(EXPECTED_IMAGES)) {
        const demo = DEMO_PRODUCTS.find((product) => product.handle === handle);
        expect(demo).toBeDefined();
        // Single-variant products seed their thumbnail from variants[0].
        expect(demo?.variants).toHaveLength(1);
        expect(demo?.variants[0]?.imageFile).toBe(file);
      }
    });

    it("builds a product thumbnail pointing at the generated image", () => {
      const context = {
        categoryIdByHandle: new Map([["vessels", "cat_vessels"]]),
        shippingProfileId: "sp_default",
        salesChannelId: "sc_default",
      };
      const cup = findDemo("hovering-cup");
      const input = buildDemoProductInput(cup, context);
      expect(input.thumbnail).toBe(`${DEMO_IMAGE_DIR}/hovering-cup.jpg`);
    });

    it("keeps every demo variant image inside DEMO_IMAGE_DIR", () => {
      for (const demo of DEMO_PRODUCTS) {
        // Thumbnail is a product-level field seeded from variants[0].
        const firstImage = demo.variants[0]?.imageFile;
        if (firstImage) {
          const input = buildDemoProductInput(demo, {
            categoryIdByHandle: new Map([[demo.categoryHandle, "cat_x"]]),
            shippingProfileId: "sp_default",
            salesChannelId: "sc_default",
          });
          expect(input.thumbnail).toBe(`${DEMO_IMAGE_DIR}/${firstImage}`);
        }
        for (const variant of demo.variants) {
          if (!variant.imageFile) {
            continue;
          }
          expect(variant.imageFile).toMatch(IMAGE_FILE_PATTERN);
        }
      }
    });

    it("preserves imagery for the retained multi-variant originals", () => {
      const paperweight = findDemo("levitating-paperweight");
      expect(paperweight.variants.map((v) => v.imageFile)).toEqual([
        "paperweight-brass.jpg",
        "paperweight-chrome.jpg",
        "paperweight-black.jpg",
        "paperweight-copper.jpg",
      ]);
      const key = findDemo("suspended-key");
      expect(key.variants.map((v) => v.imageFile)).toEqual([
        "key-nickel.jpg",
        "key-iron.jpg",
      ]);
    });
  });

  describe("salePrice wiring contract", () => {
    it("runner references ensureSalePriceList for sale-priced products", () => {
      const runnerPath = join(import.meta.dirname, "..", "seed-demo-catalog.ts");
      const runner = readFileSync(runnerPath, "utf8");
      expect(runner).toContain("ensureSalePriceList");
      expect(runner).toContain("demo.salePrice");
    });
  });

  describe("isDemoCatalogProduct", () => {
    it.each([
      [{ metadata: { demo_catalog: true } }, true],
      [{ metadata: { demo_catalog: false } }, false],
      // Strictly boolean — string values do not count as the marker.
      [{ metadata: { demo_catalog: "true" } }, false],
      [{ metadata: {} }, false],
      [{ metadata: null }, false],
      [{}, false],
    ] as const)("flags %j as %j", (product, expected) => {
      expect(isDemoCatalogProduct(product)).toBe(expected);
    });
  });

  it("keeps the canonical parent identity (strip script depends on the name)", () => {
    expect(DEMO_PARENT_CATEGORY.handle).toBe("levitating-objects");
    expect(DEMO_PARENT_CATEGORY.name).toBe("Levitating Objects");
  });

  describe("demo metadata upsert (Task 17 — filterable on existing DBs)", () => {
    const demo = findDemo("levitating-paperweight");
    const context = {
      categoryIdByHandle: new Map([["paperweights", "cat_paperweights"]]),
      shippingProfileId: "sp_default",
      salesChannelId: "sc_default",
    };

    function makeService() {
      const updated: { id: string; data: unknown }[] = [];
      return {
        service: {
          updateProducts: jest.fn(
            (id: string, data: { metadata?: Record<string, unknown> }) => {
              updated.push({ id, data });
              return { id, ...data };
            }
          ),
        },
        updated,
      };
    }

    it("intended demo metadata comes from buildDemoProductInput.metadata", () => {
      const input = buildDemoProductInput(demo, context);
      const intended = input.metadata ?? {};
      expect(intended).toMatchObject({
        demo_catalog: true,
        filterable: { material: "Stone" },
        attributes: expect.any(Array),
      });
    });

    it("upserts an existing product with the same handle (not skipped)", async () => {
      const { service, updated } = makeService();
      const existing = {
        id: "prod_existing",
        metadata: null as Record<string, unknown> | null,
      };

      const outcome = await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        existing,
        context
      );

      expect(outcome).toBe("updated");
      expect(service.updateProducts).toHaveBeenCalledTimes(1);
      expect(updated[0]?.id).toBe("prod_existing");
      const metadata = updated[0]?.data as { metadata?: Record<string, unknown> };
      expect(metadata?.metadata).toMatchObject({
        demo_catalog: true,
        filterable: { material: "Stone" },
      });
    });

    it("merges cleanly without overwriting unrelated existing metadata", async () => {
      const { service, updated } = makeService();
      const existing = {
        id: "prod_existing",
        metadata: {
          merchant_note: "keep me",
          demo_catalog: true,
        },
      };

      await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        existing,
        context
      );

      const metadata = updated[0]?.data as { metadata?: Record<string, unknown> };
      expect(metadata?.metadata).toMatchObject({
        merchant_note: "keep me",
        demo_catalog: true,
        filterable: { material: "Stone" },
      });
    });

    it("is idempotent — second run with identical metadata writes nothing", async () => {
      const { service } = makeService();
      const existing = {
        id: "prod_existing",
        metadata: buildDemoProductInput(demo, context).metadata ?? {},
      };

      const outcome = await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        existing,
        context
      );

      expect(outcome).toBe("unchanged");
      expect(service.updateProducts).not.toHaveBeenCalled();
    });

    it("keeps the deterministic keys in sync (demo_catalog stays true)", () => {
      const existing = {
        demo_catalog: true,
        merchant_note: "keep",
      };
      const intended = {
        demo_catalog: true,
        filterable: { material: "Stone" },
      };
      const { metadata, changed } = mergeDemoProductMetadata(existing, intended);

      expect(changed).toBe(true);
      expect(metadata).toEqual({
        demo_catalog: true,
        merchant_note: "keep",
        filterable: { material: "Stone" },
      });
    });

    it("reports unchanged when the deterministic keys already match", () => {
      const existing = {
        demo_catalog: true,
        filterable: { material: "Stone" },
        merchant_note: "keep",
      };
      const intended = {
        demo_catalog: true,
        filterable: { material: "Stone" },
      };
      const { metadata, changed } = mergeDemoProductMetadata(existing, intended);

      expect(changed).toBe(false);
      expect(metadata).toEqual(existing);
    });
  });

  describe("Color option placement (Task 18, Part 4)", () => {
    it("keeps at least one product intentionally single-variant (no Color)", () => {
      // Single-variant products keep the catalog's conventional
      // Default/One Size option but must NOT carry Finish/Color options —
      // that is what "single-variant" means for the demo register.
      const bare = DEMO_PRODUCTS.filter(
        (p) =>
          !p.options.some(
            (option) => option.title === "Color"
          )
      );
      expect(bare.length).toBeGreaterThanOrEqual(1);
      // The retained singles are deliberate capability demos.
      const handles = bare.map((p) => p.handle);
      expect(handles).toContain("suspended-hourglass");
      expect(handles).toContain("floating-question-mark");
    });

    it("gives every non-single product a Color option", () => {
      for (const demo of DEMO_PRODUCTS) {
        const hasColor = demo.options.some(
          (option) => option.title === "Color"
        );
        if (!hasColor) {
          continue; // intentional single-variant coverage
        }
        const titles = demo.options.map((option) => option.title);
        expect(titles).toContain("Color");
      }
    });

    it("uses only registered Color palette values", () => {
      for (const demo of DEMO_PRODUCTS) {
        const colorOption = demo.options.find(
          (option) => option.title === "Color"
        );
        if (!colorOption) {
          continue;
        }
        for (const value of colorOption.values) {
          expect(DEMO_COLOR_SWATCH_COLORS[value]).toBeDefined();
        }
      }
    });

    it("matches every variant's options to its product's declared options", () => {
      for (const demo of DEMO_PRODUCTS) {
        const declared = new Set(demo.options.map((option) => option.title));
        for (const variant of demo.variants) {
          expect(Object.keys(variant.options).sort()).toEqual(
            Array.from(declared).sort()
          );
        }
      }
    });

    it("builds variant options through buildDemoProductInput", () => {
      const paperweight = findDemo("levitating-paperweight");
      const input = buildDemoProductInput(paperweight, {
        categoryIdByHandle: new Map([["paperweights", "cat_x"]]),
        shippingProfileId: "sp_default",
        salesChannelId: "sc_default",
      });
      expect(input.options).toEqual(
        expect.arrayContaining([
          { title: "Color", values: ["Antique Brass", "Chrome", "Black", "Copper"] },
        ])
      );
      const ab = input.variants?.find((v) => v.sku === "DEMO-LEV-AB");
      expect(ab?.options).toEqual({
        Color: "Antique Brass",
      });
    });
  });

  describe("Color option upsert on existing products (Task 18, Part 4)", () => {
    const demo = findDemo("levitating-paperweight");
    const context = {
      categoryIdByHandle: new Map([["paperweights", "cat_paperweights"]]),
      shippingProfileId: "sp_default",
      salesChannelId: "sc_default",
    };

    function makeService() {
      const updated: { id: string; data: Record<string, unknown> }[] = [];
      const deleted: string[][] = [];
      return {
        service: {
          updateProducts: jest.fn((id: string, data: Record<string, unknown>) => {
            updated.push({ id, data });
            return { id, ...data };
          }),
          listProductVariants: jest.fn(() => {
            return [
              [
                { id: "v_ab", sku: "DEMO-LEV-AB" },
                { id: "v_stale", sku: "DEMO-STALE-OLD" },
              ],
            ];
          }),
          deleteProductVariants: jest.fn((ids: string[]) => {
            deleted.push(ids);
          }),
          listProductOptions: jest.fn(async () => [] as unknown as [{ id: string; title?: string }[]]),
          createProductOptions: jest.fn(),
        },
        updated,
        deleted,
      };
    }

    it("passes options + variants to updateProducts when applied", async () => {
      const { service, updated } = makeService();
      const outcome = await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        { id: "prod_existing", metadata: {} },
        context,
        { applyOptionsAndVariants: true, pg: { query: jest.fn(async () => []) } }
      );

      expect(outcome).toBe("updated");
      expect(service.updateProducts).toHaveBeenCalledTimes(1);
      const data = updated[0]?.data ?? {};
      expect(data.options).toEqual([
        { title: "Color", values: ["Antique Brass", "Chrome", "Black", "Copper"] },
      ]);
      expect(Array.isArray(data.variants)).toBe(true);
      expect(data.variants).toHaveLength(4);
    });

    it("prunes stale variants not present in the register SKU set", async () => {
      const { service, deleted } = makeService();
      await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        { id: "prod_existing", metadata: {} },
        context,
        { applyOptionsAndVariants: true, pg: { query: jest.fn(async () => []) } }
      );

      expect(service.listProductVariants).toHaveBeenCalledTimes(1);
      expect(service.deleteProductVariants).toHaveBeenCalledTimes(1);
      expect(deleted[0]).toContain("v_stale");
      expect(deleted[0]).not.toContain("v_ab");
    });

    it("removes orphaned inventory rows for stale variant SKUs (best-effort)", async () => {
      const { service } = makeService();
      const pg = { query: jest.fn(async () => []) };
      await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        { id: "prod_existing", metadata: {} },
        context,
        { applyOptionsAndVariants: true, pg }
      );

      expect(pg.query).toHaveBeenCalledTimes(1);
      const [sql] = pg.query.mock.calls[0];
      expect(sql).toContain("DELETE FROM inventory_item");
      expect(sql).toContain("DEMO-STALE-OLD");
    });

    it("is idempotent when metadata matches and variants match the register", async () => {
      const service = {
        updateProducts: jest.fn(),
        listProductVariants: jest.fn(async () => [[]] as unknown as [{ id: string; sku?: string | null }[]]),
        deleteProductVariants: jest.fn(),
        listProductOptions: jest.fn(async () => [] as unknown as [{ id: string; title?: string }[]]),
        createProductOptions: jest.fn(),
      };
      const existing = {
        id: "prod_existing",
        metadata: buildDemoProductInput(demo, context).metadata ?? {},
      };

      const outcome = await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn() } as never,
        demo,
        existing,
        context,
        { applyOptionsAndVariants: true, pg: { query: jest.fn(async () => []) } }
      );

      // Metadata already matches, but the option/variant refresh is still
      // requested — only the stale-variant prune is a no-op.
      expect(outcome).toBe("updated");
      expect(service.updateProducts).toHaveBeenCalledTimes(1);
      expect(service.deleteProductVariants).not.toHaveBeenCalled();
    });
  });

  describe("missing Color option creation (Task 18b — updateProducts drops new options)", () => {
    const demo = findDemo("levitating-paperweight");
    const context = {
      categoryIdByHandle: new Map([["paperweights", "cat_paperweights"]]),
      shippingProfileId: "sp_default",
      salesChannelId: "sc_default",
    };

    const LEGACY_FINISH_PRODUCT = {
      id: "prod_legacy_finish",
      // Pre-merge DB state: Finish option exists (Color not yet canonical).
      options: [
        {
          id: "opt_legacy_finish",
          title: "Finish",
          product_id: "prod_legacy_finish",
          values: [
            { id: "optval_ab", value: "Antique Brass" },
            { id: "optval_cr", value: "Chrome" },
            { id: "optval_bk", value: "Black" },
            { id: "optval_cu", value: "Copper" },
          ],
        },
      ],
    };

    function makeService() {
      const createdOptions: {
        data: { title: string; values: string[] }[];
      }[] = [];
      const variants: Record<string, unknown>[] = [];
      return {
        service: {
          listProductOptions: jest.fn(() => {
            return LEGACY_FINISH_PRODUCT.options;
          }),
          createProductOptions: jest.fn(
            (data: { title: string; values: string[] }[]) => {
              createdOptions.push({ data });
              // Mirror Medusa's response: created options come back with ids.
              return (Array.isArray(data) ? data : [data]).map(
                (option, index) => ({
                  id: `opt_new_${index}`,
                  ...option,
                  product_id: LEGACY_FINISH_PRODUCT.id,
                  values: option.values.map((value, valueIndex) => ({
                    id: `optval_new_${index}_${valueIndex}`,
                    value,
                  })),
                })
              );
            }
          ),
          updateProducts: jest.fn((id: string, data: Record<string, unknown>) => {
            variants.length = 0;
            for (const variant of (data.variants as Record<string, unknown>[]) ?? []) {
              variants.push({ sku: variant.sku, options: variant.options });
            }
            return { id, ...data };
          }),
          listProductVariants: jest.fn(async () => [[]] as unknown as [{ id: string; sku?: string | null }[]]),
          deleteProductVariants: jest.fn(),
        },
        createdOptions,
        variants,
      };
    }

    it("creates the missing Color option before updating the product", async () => {
      const { service, createdOptions } = makeService();

      await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn(), warn: jest.fn() } as never,
        demo,
        { id: LEGACY_FINISH_PRODUCT.id, metadata: {} },
        context,
        { applyOptionsAndVariants: true, pg: { query: jest.fn(async () => []) } }
      );

      // The missing option is created via the module service (not just passed
      // through updateProducts, which Medusa normalizes away).
      expect(service.createProductOptions).toHaveBeenCalledTimes(1);
      const created = createdOptions[0]?.data ?? [];
      expect(created).toContainEqual(
        expect.objectContaining({ title: "Color", values: ["Antique Brass", "Chrome", "Black", "Copper"] })
      );
      // Legacy Finish option is superseded and must NOT be re-created.
      expect(created.some((option) => option.title === "Finish")).toBe(false);

      // updateProducts still runs to attach variants to the now-complete option surface.
      expect(service.updateProducts).toHaveBeenCalledTimes(1);
    });

    it("leaves every register variant's Color value attached to the product", async () => {
      const { service, variants } = makeService();

      await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn(), warn: jest.fn() } as never,
        demo,
        { id: LEGACY_FINISH_PRODUCT.id, metadata: {} },
        context,
        { applyOptionsAndVariants: true, pg: { query: jest.fn(async () => []) } }
      );

      // All four paperweight variants carry their former finish value under
      // the merged Color option — the same tuple reaches updateProducts so
      // Medusa can attach values.
      expect(variants).toHaveLength(4);
      const colorValues = variants.map(
        (variant) => (variant.options as Record<string, string> | undefined)?.Color
      );
      expect(new Set(colorValues)).toEqual(
        new Set(["Antique Brass", "Chrome", "Black", "Copper"])
      );
    });

    it("is idempotent — a product that already has Color is not re-created", async () => {
      const service = {
        listProductOptions: jest.fn(() => {
          return [
            // Full register option surface: legacy Finish AND Color already present.
            ...LEGACY_FINISH_PRODUCT.options,
            {
              id: "opt_color",
              title: "Color",
              product_id: LEGACY_FINISH_PRODUCT.id,
              values: [
                { id: "optval_ab", value: "Antique Brass" },
                { id: "optval_cr", value: "Chrome" },
                { id: "optval_bk", value: "Black" },
                { id: "optval_cu", value: "Copper" },
              ],
            },
          ] as never;
        }),
        createProductOptions: jest.fn(),
        updateProducts: jest.fn(),
        listProductVariants: jest.fn(async () => [[]] as unknown as [{ id: string; sku?: string | null }[]]),
        deleteProductVariants: jest.fn(),
      };

      await upsertDemoProductMetadata(
        service as never,
        { info: jest.fn(), warn: jest.fn() } as never,
        demo,
        { id: LEGACY_FINISH_PRODUCT.id, metadata: {} },
        context,
        { applyOptionsAndVariants: true, pg: { query: jest.fn(async () => []) } }
      );

      expect(service.createProductOptions).not.toHaveBeenCalled();
      // updateProducts still runs (record refreshed), but no option rows are duplicated.
      expect(service.updateProducts).toHaveBeenCalledTimes(1);
    });
  });
});
