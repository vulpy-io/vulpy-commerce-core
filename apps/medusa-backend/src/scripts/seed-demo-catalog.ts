/**
 * Demo catalog seed — "Levitating Philosophical Objects" (Task 9).
 *
 * Additive + idempotent: every product/category is looked up before create
 * (no duplicates on re-run), and the whole batch is namespaced under
 * `metadata.demo_catalog = true` so it never collides with baseline seed
 * data and can be removed via `strip-demo-catalog.ts`.
 *
 * Run AFTER the main seed (it reuses the Default shipping profile + sales
 * channel created there):
 *
 *   pnpm --filter @apps/medusa-backend exec medusa exec ./src/scripts/seed-demo-catalog.ts
 */
import type {
  ExecArgs,
  IProductModuleService,
  ISalesChannelModuleService,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { invalidateShopCatalogCache } from "../modules/shopCatalog/shop-catalog-cache";
import {
  buildDemoProductInput,
  DEMO_BESTSELLER_HANDLES,
  DEMO_CATALOG_MARKER,
  DEMO_CATALOG_METADATA_KEY,
  DEMO_CHILD_CATEGORIES,
  DEMO_COLOR_SWATCH_COLORS,
  DEMO_GRANDCHILD_CATEGORIES,
  DEMO_PARENT_CATEGORY,
  DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES,
  DEMO_PRODUCTS,
  DEMO_TOP_LEVEL_CATEGORIES,
  upsertDemoProductMetadata,
} from "./demo-catalog";
import {
  ensureSalePriceList,
  findOneByName,
  getOrCreateProductCategories,
  getOrCreateProductTag,
} from "./seed-helpers";

/** Bestseller badge color — matches the footer surface (Fox taupe). */
const BESTSELLER_TAG_COLOR = "#eae3d9";
const BESTSELLER_TAG_VALUE = "Bestseller";

export default async function seedDemoCatalog({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModuleService = container.resolve<IProductModuleService>(
    Modules.PRODUCT
  );
  const salesChannelModuleService =
    container.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL);
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as {
    query: (sql: string) => Promise<unknown[]>;
  };

  // --- Resolve baseline prerequisites (created by the main seed) ----------
  const [salesChannel] = await salesChannelModuleService.listSalesChannels(
    { name: "Default Sales Channel" },
    { take: 1 }
  );
  if (!salesChannel) {
    logger.warn(
      "[demo-catalog] Default Sales Channel not found — run the main seed first. Skipping."
    );
    return;
  }

  const shippingProfile = await findOneByName<{
    id: string;
    name?: string;
  }>(container, "shipping_profile", "Default");
  if (!shippingProfile) {
    logger.warn(
      "[demo-catalog] 'Default' shipping profile not found — run the main seed first. Skipping."
    );
    return;
  }

  // --- Categories: parent first, then children attached to it -------------
  const [parent] = await getOrCreateProductCategories(container, logger, [
    {
      name: DEMO_PARENT_CATEGORY.name,
      description: DEMO_PARENT_CATEGORY.description,
      is_active: true,
      metadata: {
        [DEMO_CATALOG_METADATA_KEY]: DEMO_CATALOG_MARKER,
        image_url: `/images/products/demo/${DEMO_PARENT_CATEGORY.imageFile}`,
      },
    },
  ]);
  const parentId = String(parent.id);
  const topLevelCategories = await getOrCreateProductCategories(
    container,
    logger,
    DEMO_TOP_LEVEL_CATEGORIES.map((category) => ({
      handle: category.handle,
      name: category.name,
      description: category.description,
      is_active: true,
      parent_category_id: null,
      metadata: {
        [DEMO_CATALOG_METADATA_KEY]: DEMO_CATALOG_MARKER,
        image_url: `/images/products/demo/${category.imageFile}`,
      },
    }))
  );

  const childCategories = await getOrCreateProductCategories(
    container,
    logger,
    DEMO_CHILD_CATEGORIES.map((child) => ({
      handle: child.handle,
      name: child.name,
      description: child.description,
      is_active: true,
      parent_category_id: parentId,
      metadata: {
        [DEMO_CATALOG_METADATA_KEY]: DEMO_CATALOG_MARKER,
        image_url: `/images/products/demo/${child.imageFile}`,
      },
    }))
  );

  const categoryIdByHandle = new Map<string, string>();
  categoryIdByHandle.set(DEMO_PARENT_CATEGORY.handle, parentId);
  DEMO_TOP_LEVEL_CATEGORIES.forEach((category, index) => {
    const id = topLevelCategories[index]?.id;
    if (id) {
      categoryIdByHandle.set(category.handle, String(id));
    }
  });
  DEMO_CHILD_CATEGORIES.forEach((child, index) => {
    const id = childCategories[index]?.id;
    if (id) {
      categoryIdByHandle.set(child.handle, String(id));
    }
  });

  // --- 3rd-level grandchildren (under `paperweights`) ----------------------
  // Created with parent_category_id = the paperweights child id. Reuses the
  // same getOrCreate helper, so re-running the seed cannot duplicate them.
  const grandchildCategories = await getOrCreateProductCategories(
    container,
    logger,
    DEMO_GRANDCHILD_CATEGORIES.map((grandchild) => {
      const parentIdForGrandchild = categoryIdByHandle.get(grandchild.parentHandle);
      if (!parentIdForGrandchild) {
        throw new Error(
          `Demo parent category missing for grandchild ${grandchild.handle}`
        );
      }
      return {
        name: grandchild.name,
        description: grandchild.description,
        is_active: true,
        parent_category_id: parentIdForGrandchild,
        metadata: {
          [DEMO_CATALOG_METADATA_KEY]: DEMO_CATALOG_MARKER,
          image_url: `/images/products/demo/${grandchild.imageFile}`,
        },
      };
    })
  );
  DEMO_GRANDCHILD_CATEGORIES.forEach((grandchild, index) => {
    const id = grandchildCategories[index]?.id;
    if (id) {
      categoryIdByHandle.set(grandchild.handle, String(id));
    }
  });

  // --- Products -------------------------------------------------------------
  for (const demo of DEMO_PRODUCTS) {
    const [existing] = await productModuleService.listProducts(
      { handle: demo.handle },
      { take: 1, relations: ["categories"] }
    );
    if (existing) {
      // Task 17 — existing products on shipping DBs were created before the
      // filterable metadata existed, so instead of skipping, merge the
      // deterministic demo keys (filterable, attributes, …) into their
      // metadata. Task 18 (Part 4) — also apply the register's canonical
      // options + variants so reruns add Finish/Color to older DBs without
      // duplicates. Idempotent: identical metadata + variant surface is a
      // no-op, and stale Finish-only tuples are pruned to their intended SKUs.
      await upsertDemoProductMetadata(
        productModuleService,
        logger,
        demo,
        { id: existing.id, metadata: existing.metadata },
        {
          categoryIdByHandle,
          shippingProfileId: shippingProfile.id,
          salesChannelId: salesChannel.id,
        },
        { applyOptionsAndVariants: true, pg }
      );
      // Link the demo product into its extra categories (3rd-level demo).
      await assignExtraDemoCategories(
        productModuleService,
        logger,
        demo,
        existing,
        categoryIdByHandle
      );
      continue;
    }

    await createProductsWorkflow(container).run({
      input: {
        products: [
          buildDemoProductInput(demo, {
            categoryIdByHandle,
            shippingProfileId: shippingProfile.id,
            salesChannelId: salesChannel.id,
          }),
        ],
      },
    });
    logger.info(`[demo-catalog] Product "${demo.handle}" created.`);

    // Fresh product — attach extra categories via its id.
    const [created] = await productModuleService.listProducts(
      { handle: demo.handle },
      { take: 1, relations: ["categories"] }
    );
    if (created) {
      await assignExtraDemoCategories(
        productModuleService,
        logger,
        demo,
        created,
        categoryIdByHandle
      );
    }
  }

  // --- Bestseller tag (card badge, footer-taupe color) ----------------------
  const bestsellerTag = await getOrCreateProductTag(container, logger, BESTSELLER_TAG_VALUE, {
    show_in_store: true,
    color: BESTSELLER_TAG_COLOR,
  });
  for (const handle of DEMO_BESTSELLER_HANDLES) {
    const [product] = await productModuleService.listProducts(
      { handle },
      { take: 1, relations: ["tags"] }
    );
    if (!product) {
      continue;
    }
    const existingTagIds = (product.tags ?? []).map((tag) => tag.id);
    if (existingTagIds.includes(bestsellerTag.id)) {
      continue;
    }
    await productModuleService.updateProducts(product.id, {
      tag_ids: [...existingTagIds, bestsellerTag.id],
    } as never);
    logger.info(`[demo-catalog] Tagged "${handle}" as Bestseller.`);
  }

  // --- Sale pricing (single sale demo keeps the % off badge alive) ----------
  const region = await findOneByName<{ id: string; currency_code?: string }>(
    container,
    "region",
    "United States"
  );
  if (!region) {
    logger.warn(
      "[demo-catalog] 'United States' region not found — run the main seed first. Skipping sale prices."
    );
    return;
  }

  const saleProducts = DEMO_PRODUCTS.filter(
    (demo): demo is typeof demo & { salePrice: number } =>
      typeof demo.salePrice === "number"
  );
  for (const demo of saleProducts) {
    const [product] = await productModuleService.listProducts(
      { handle: demo.handle },
      { take: 1, relations: ["variants"] }
    );
    if (!product) {
      continue;
    }
    await ensureSalePriceList(container, logger, {
      title: "Demo Catalog Sale",
      description: "Sale pricing for the packaged demo catalog.",
      prices: (product.variants ?? []).map((variant) => ({
        amount: demo.salePrice,
        currency_code: region.currency_code ?? "usd",
        variant_id: variant.id,

      })),
    });
  }

  // --- Finish swatch metadata (scoped to demo products' option values) ------
  await stampFinishSwatchMetadata(productModuleService, logger);

  // Clear Redis-backed catalog responses created before a clean demo seed.
  await invalidateShopCatalogCache();

  logger.info("[demo-catalog] Done.");
}

/**
 * Stamp `swatch_color` onto the Color option values of demo products.
 *
 * Scoped: only option values reached through a demo product are touched, so
 * a merchant's own identically-named colors are never modified.
 */
async function stampFinishSwatchMetadata(
  productModuleService: IProductModuleService,
  logger: { info: (message: string) => void }
): Promise<void> {
  let stamped = 0;
  let reused = 0;

  for (const demo of DEMO_PRODUCTS) {
    const [product] = await productModuleService.listProducts(
      { handle: demo.handle },
      { take: 1, relations: ["options", "options.values"] }
    );
    if (!product) {
      continue;
    }

    const finishOption = (product.options ?? []).find(
      (option) =>
        option.title?.toLowerCase() === "color" ||
        option.title?.toLowerCase() === "finish"
    );
    if (!finishOption) {
      continue;
    }

    for (const value of finishOption.values ?? []) {
      const hex = DEMO_COLOR_SWATCH_COLORS[value.value];
      if (!hex) {
        continue;
      }
      const current = (value.metadata ?? {}) as Record<string, unknown>;
      if (current.swatch_color === hex && current.demo_catalog === true) {
        reused += 1;
        continue;
      }
      await productModuleService.updateProductOptionValues(value.id, {
        metadata: { ...current, swatch_color: hex, demo_catalog: true },
      });
      stamped += 1;
    }
  }

  logger.info(
    `[demo-catalog] Color swatches: ${stamped} stamped, ${reused} reused.`
  );
}

/**
 * Link a demo product into its declared extra categories (products may belong
 * to multiple categories). Powers the 3rd-level demo: the levitating
 * paperweight is added to Desk + Cabinet Paperweights so both grandchildren
 * have product coverage (`categoryHasProducts` hides empty categories).
 *
 * Idempotent — merges category_ids, never removes existing ones.
 */
async function assignExtraDemoCategories(
  productModuleService: IProductModuleService,
  logger: { info: (message: string) => void },
  demo: { handle: string },
  product: { id: string; categories?: { id: string }[] | null },
  categoryIdByHandle: Map<string, string>
): Promise<void> {
  const extraHandles = DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES[demo.handle];
  if (!extraHandles || extraHandles.length === 0) {
    return;
  }

  const extraIds = extraHandles
    .map((handle) => categoryIdByHandle.get(handle))
    .filter((id): id is string => Boolean(id));
  if (extraIds.length === 0) {
    return;
  }

  const existingIds = (product.categories ?? []).map((category) => category.id);
  const missing = extraIds.filter((id) => !existingIds.includes(id));
  if (missing.length === 0) {
    return;
  }

  await productModuleService.updateProducts(product.id, {
    category_ids: [...existingIds, ...missing],
  } as never);
  logger.info(
    `[demo-catalog] Linked "${demo.handle}" into ${missing.join(", ")}.`
  );
}
