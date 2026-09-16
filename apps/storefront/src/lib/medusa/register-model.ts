import type { HttpTypes } from "@medusajs/types";
import { categoryHasProducts, collectCategoryDescendantIds } from "./categories";

export type RegisterChild = {
  handle: string;
  title: string;
  count: number;
};

/**
 * Build the ordered editorial "Register" of product-bearing child categories.
 *
 * Order = tree order of `category.category_children` (the numbered register
 * 01–04 of the design source — NOT alphabetical). Children with no products
 * anywhere in their descendant scope are excluded. `count` is the number of
 * product-bearing categories inside the child's descendant scope (the child
 * itself included), i.e. `collectCategoryDescendantIds(child) ∩
 * productCategoryIds`.
 */
export function buildRegisterChildren(
  category: HttpTypes.StoreProductCategory,
  productCategoryIds: Set<string>
): RegisterChild[] {
  const register: RegisterChild[] = [];

  for (const child of category.category_children ?? []) {
    if (!categoryHasProducts(child, productCategoryIds)) {
      continue;
    }

    const descendantIds = collectCategoryDescendantIds(child);
    const count = descendantIds.filter((id) => productCategoryIds.has(id))
      .length;

    register.push({
      handle: child.handle ?? "",
      title: child.name ?? "",
      count,
    });
  }

  return register;
}