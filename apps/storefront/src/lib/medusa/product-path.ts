export function productPagePath(
  handle: string,
  options?: { variantId?: string }
): string {
  const path = `/products/${handle}`;
  const variantId = options?.variantId?.trim();

  if (!variantId) {
    return path;
  }

  const params = new URLSearchParams({ variant: variantId });
  return `${path}?${params.toString()}`;
}
