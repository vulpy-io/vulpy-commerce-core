const LEGACY_STOREFRONT_NAME = "Medusa Store";
const STOREFRONT_NAME = "Vulpy Commerce";
const SEEDED_HOMEPAGE_TITLES = new Set([
  "Medusa Store | Medusa Commerce",
  "Vulpy Commerce | Medusa Commerce",
]);

/**
 * Replace the legacy seed brand in strings and nested Payload values.
 * Known exact homepage seed titles collapse to the product name. Other strings
 * only replace the legacy storefront name, preserving custom content.
 */
export function replaceLegacyStorefrontBrand(value: unknown): unknown {
  if (typeof value === "string") {
    if (SEEDED_HOMEPAGE_TITLES.has(value)) {
      return STOREFRONT_NAME;
    }
    return value.split(LEGACY_STOREFRONT_NAME).join(STOREFRONT_NAME);
  }

  if (Array.isArray(value)) {
    return value.map(replaceLegacyStorefrontBrand);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        replaceLegacyStorefrontBrand(child),
      ])
    );
  }

  return value;
}

/** Return the narrow SEO update for a page, without mutating any page data. */
export function migrateLegacyPageSeo(page: Record<string, unknown>): {
  changed: boolean;
  seo: unknown;
} {
  const seo = page.seo;
  const brandedSeo = replaceLegacyStorefrontBrand(seo);
  return {
    changed: JSON.stringify(brandedSeo) !== JSON.stringify(seo),
    seo: brandedSeo,
  };
}
