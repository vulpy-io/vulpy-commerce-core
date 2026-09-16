const TRAILING_SLASH = /\/$/;
const ABSOLUTE_URL = /^https?:\/\//i;

/** Local storefront asset when Medusa product has no thumbnail. */
export const PRODUCT_PLACEHOLDER_IMAGE = "/images/products/placeholder.svg";

function getPublicMedusaAssetBase(): string {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_ASSET_URL?.replace(TRAILING_SLASH, "") ??
    ""
  );
}

function extractPathname(url: string): string | null {
  if (!ABSOLUTE_URL.test(url)) {
    return null;
  }

  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function extractStorefrontImagePath(url: string): string | null {
  if (url.startsWith("/images/")) {
    return url;
  }

  const pathname = extractPathname(url);
  return pathname?.startsWith("/images/") ? pathname : null;
}

function extractStaticPath(url: string): string | null {
  if (url.startsWith("/static/")) {
    return url;
  }

  const pathname = extractPathname(url);
  return pathname?.startsWith("/static/") ? pathname : null;
}

/** Resolve Medusa product/category image URLs for browser display. */
export function resolveMedusaAssetUrl(
  url: string | null | undefined
): string | null {
  if (!url?.trim()) {
    return null;
  }

  const trimmed = url.trim();

  const storefrontImagePath = extractStorefrontImagePath(trimmed);
  if (storefrontImagePath) {
    return storefrontImagePath;
  }

  const staticPath = extractStaticPath(trimmed);
  if (staticPath) {
    const base = getPublicMedusaAssetBase();
    return base ? `${base}${staticPath}` : staticPath;
  }

  if (ABSOLUTE_URL.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    const base = getPublicMedusaAssetBase();
    return base ? `${base}${trimmed}` : trimmed;
  }

  return trimmed;
}

export function resolveMedusaAssetUrlOrFallback(
  url: string | null | undefined,
  fallback: string = PRODUCT_PLACEHOLDER_IMAGE
): string {
  return resolveMedusaAssetUrl(url) ?? fallback;
}
