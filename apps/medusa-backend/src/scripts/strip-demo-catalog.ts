/**
 * Demo catalog strip — removes every record stamped with
 * `metadata.demo_catalog = true` (products + categories). This is the
 * core-version extraction path for the Task 9 Pro demo: run it before
 * shipping a core template.
 *
 * Idempotent: re-running finds nothing and exits 0.
 *
 *   pnpm --filter @apps/medusa-backend exec medusa exec ./src/scripts/strip-demo-catalog.ts
 */
import type {
  ExecArgs,
  IProductModuleService,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  deleteDemoInventoryRows,
  isDemoCatalogProduct,
} from "./demo-catalog";

interface DemoCategory {
  id: string;
  name?: string | null;
  parent_category_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Order demo categories so children are deleted before their parents.
 * Medusa refuses to delete a category that still has children, and the
 * category list order is not guaranteed to be leaf-first (with 3rd-level
 * grandchildren, paperweights and its grandchildren are both in the set).
 * Sorting by DESCENDING tree depth (leaves first, deepest first) guarantees
 * a category is removed only after all of its descendants.
 *
 * The depth index must be built from ALL categories (including the demo
 * parent) — if a category's parent is missing from the index its depth
 * collapses to 0 and it sorts as a leaf even though it has children.
 */
function orderChildrenFirst(
  categories: DemoCategory[],
  allCategories: DemoCategory[]
): DemoCategory[] {
  // Depth index built from ALL categories (incl. the demo parent), so a
  // category's parent is always resolvable. If the parent is missing from
  // the index the depth collapses to 0 and it sorts as a leaf.
  const idToCategory = new Map(allCategories.map((c) => [c.id, c]));

  function depth(category: DemoCategory, seen: Set<string>): number {
    if (!category.parent_category_id) {
      return 0;
    }
    if (seen.has(category.id)) {
      return 0; // cycle guard — shouldn't happen
    }
    const parent = idToCategory.get(category.parent_category_id);
    if (!parent) {
      return 0;
    }
    seen.add(category.id);
    return 1 + depth(parent, seen);
  }

  // Descending depth: deepest (leaves) first, so parents are deleted last.
  return [...categories].sort(
    (a, b) => depth(b, new Set()) - depth(a, new Set())
  );
}

export default async function stripDemoCatalog({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModuleService = container.resolve<IProductModuleService>(
    Modules.PRODUCT
  );

  // --- Products -------------------------------------------------------------
  const products = await productModuleService.listProducts({}, { take: null });
  const demoProducts = (products ?? []).filter(isDemoCatalogProduct);

  if (demoProducts.length > 0) {
    // Delete inventory items for demo variants BEFORE deleting the products:
    // Medusa keeps inventory items alive after their variant is gone, and a
    // re-seed then fails with "Inventory item with sku … already exists"
    // (unique SKU constraint on orphaned rows).
    const connection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    await deleteDemoInventoryRows(connection, { skuLike: "DEMO-%" });
    await productModuleService.deleteProducts(
      demoProducts.map((product) => product.id)
    );
  }
  logger.info(`[demo-catalog] Removed ${demoProducts.length} demo product(s).`);

  // --- Categories (children first, then the parent) --------------------------
  const categories = (await productModuleService.listProductCategories(
    {},
    { take: null, select: ["id", "name", "parent_category_id", "metadata"] }
  )) as unknown as DemoCategory[];

  const demoChildCategories = categories.filter(
    (category) =>
      category.name !== "Levitating Objects" && isDemoCatalogProduct(category)
  );
  const demoParentCategories = categories.filter(
    (category) => category.name === "Levitating Objects" && isDemoCatalogProduct(category)
  );

  // Deleting children first avoids dangling parent references on re-seed.
  // Medusa refuses to delete a category that still has children, so the
  // deletes must run in two separate calls (a single batched delete hits the
  // parent before its children are gone). With 3rd-level grandchildren, sort
  // the demo children leaf-first so paperweights is only deleted after its
  // own grandchildren. The depth index needs ALL categories (incl. the demo
  // parent) so parent lookups resolve.
  const ordered = [
    ...orderChildrenFirst(demoChildCategories, categories),
    ...demoParentCategories,
  ];
  for (const category of ordered) {
    await productModuleService.deleteProductCategories([category.id]);
  }
  logger.info(`[demo-catalog] Removed ${ordered.length} demo categor(y/ies).`);

  logger.info("[demo-catalog] Strip complete.");
}
