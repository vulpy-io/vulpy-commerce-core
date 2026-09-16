export const DEFAULT_SHOP_PAGE_SIZE = 20;

export function getShopPageSize() {
  const raw = process.env.SHOP_PAGE_SIZE;
  const parsed = Number(raw ?? DEFAULT_SHOP_PAGE_SIZE);

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_SHOP_PAGE_SIZE;
}
