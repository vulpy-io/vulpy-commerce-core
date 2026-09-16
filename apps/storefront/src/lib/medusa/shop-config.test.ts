import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SHOP_PAGE_SIZE, getShopPageSize } from "./shop-config";

describe("getShopPageSize", () => {
  afterEach(() => {
    process.env.SHOP_PAGE_SIZE = undefined;
  });

  it("defaults to 20 when env is unset", () => {
    expect(getShopPageSize()).toBe(DEFAULT_SHOP_PAGE_SIZE);
  });

  it("reads SHOP_PAGE_SIZE from env", () => {
    process.env.SHOP_PAGE_SIZE = "24";
    expect(getShopPageSize()).toBe(24);
  });
});
