import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import { buildRegisterChildren } from "./register-model";

type StoreCategory = HttpTypes.StoreProductCategory;

function category(
  id: string,
  children: StoreCategory[] = []
): StoreCategory {
  return {
    id,
    name: id,
    handle: id,
    description: "",
    category_children: children,
    parent_category: null,
    parent_category_id: null,
    rank: 0,
    created_at: "",
    updated_at: "",
  } as StoreCategory;
}

describe("buildRegisterChildren", () => {
  it("preserves tree order of category_children (not alphabetical)", () => {
    const parent = category("pcat_ceiling", [
      category("pcat_zzz"),
      category("pcat_aaa"),
      category("pcat_mmm"),
    ]);
    const ids = new Set(["pcat_zzz", "pcat_aaa", "pcat_mmm"]);

    expect(buildRegisterChildren(parent, ids).map((child) => child.handle)).toEqual([
      "pcat_zzz",
      "pcat_aaa",
      "pcat_mmm",
    ]);
  });

  it("excludes children without products", () => {
    const parent = category("pcat_top", [
      category("pcat_with_products"),
      category("pcat_empty"),
      category("pcat_via_grandchild", [category("pcat_grandchild")]),
    ]);
    const ids = new Set(["pcat_with_products", "pcat_grandchild"]);

    const register = buildRegisterChildren(parent, ids);

    expect(register.map((child) => child.handle)).toEqual([
      "pcat_with_products",
      "pcat_via_grandchild",
    ]);
  });

  it("counts product-bearing categories across the descendant scope", () => {
    const parent = category("pcat_top", [
      category("pcat_direct", [
        category("pcat_nested_in_set"),
        category("pcat_nested_not_in_set"),
      ]),
      category("pcat_indirect", [category("pcat_deep_in_set")]),
      category("pcat_another_direct"),
    ]);
    const ids = new Set([
      "pcat_direct",
      "pcat_nested_in_set",
      "pcat_deep_in_set",
      "pcat_another_direct",
    ]);

    const register = buildRegisterChildren(parent, ids);
    const byHandle = new Map(register.map((child) => [child.handle, child]));

    // Direct + one nested child in scope = 2 (the child itself counts).
    expect(byHandle.get("pcat_direct")?.count).toBe(2);
    // Only the grandchild is in scope; the child itself has no products.
    expect(byHandle.get("pcat_indirect")?.count).toBe(1);
    expect(byHandle.get("pcat_another_direct")?.count).toBe(1);
  });

  it("carries handle and title through", () => {
    const child = {
      id: "pcat_ceiling_lights",
      name: "Ceiling Lights",
      handle: "ceiling-lights",
      description: "",
      category_children: [],
    } as unknown as StoreCategory;

    const register = buildRegisterChildren(
      category("pcat_top", [child]),
      new Set(["pcat_ceiling_lights"])
    );

    expect(register[0]).toEqual({
      handle: "ceiling-lights",
      title: "Ceiling Lights",
      count: 1,
    });
  });

  it("returns an empty register for leaf categories", () => {
    expect(buildRegisterChildren(category("pcat_leaf"), new Set(["pcat_leaf"]))).toEqual([]);
  });

  it("returns an empty register when no product categories exist", () => {
    const parent = category("pcat_top", [
      category("pcat_a"),
      category("pcat_b"),
    ]);

    expect(buildRegisterChildren(parent, new Set())).toEqual([]);
  });

  it("does not count unrelated product categories", () => {
    const parent = category("pcat_top", [
      category("pcat_a"),
      category("pcat_b"),
    ]);

    const register = buildRegisterChildren(
      parent,
      new Set(["pcat_unrelated", "pcat_other_branch"])
    );

    expect(register).toEqual([]);
  });
});