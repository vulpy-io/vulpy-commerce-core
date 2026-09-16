/**
 * surface-contracts.mjs
 *
 * Defines the commerce-core / marketing surface boundary.
 * Used by the designer profile to determine what structural changes are allowed
 * and by the token registry to scope danger levels.
 *
 * Import with:
 *   import { getSurfaceForPath, isStructuralChangeAllowed, SURFACES } from "./surface-contracts.mjs";
 */

export const SURFACES = {
  "commerce-core": {
    description: "Conversion-tested pages — structural changes are dangerous and need explicit override.",
    routes: [
      "/checkout",
      "/cart",
      "/products/",
      "/shop",
      "/my-account",
      "/orders",
      "/signin",
      "/signup",
    ],
    allowedChanges: ["token-level (colors, fonts, spacing)", "copy updates", "image swaps"],
    blockedChanges: ["layout restructure", "component reorder", "new component injection", "removal of trust signals"],
    overrideWarning: "⚠️ COMMERCE-CORE STRUCTURAL CHANGE: This page is conversion-tested. Structural modifications risk checkout abandonment. Recommend token-level changes only. Proceeding requires explicit operator confirmation.",
  },
  marketing: {
    description: "Marketing pages and blocks — full creative license for layout, copy, structure.",
    routes: [
      "/",
      "/blog",
      "/about",
      "/contact",
      "/landing/",
    ],
    blockSlugs: [
      "hero",
      "promoBanners",
      "countdownPromo",
      "testimonials",
      "newsletter",
      "richText",
      "cta",
      "faq",
      "media",
      "mediaWithText",
      "spacer",
      "contactInfo",
      "contactForm",
    ],
    allowedChanges: ["everything — full creative license"],
    blockedChanges: [],
  },
  "commerce-display": {
    description: "Commerce blocks that display products — token changes + limited layout within the block.",
    routes: [],
    blockSlugs: [
      "productGrid",
      "categoryGrid",
    ],
    allowedChanges: ["token-level", "grid column count", "card variant (compact/full)"],
    blockedChanges: ["price display removal", "add-to-cart removal", "stock indicator removal"],
  },
};

/**
 * Determine which surface a given route path belongs to.
 * @param {string} path — e.g. "/checkout" or "/products/medusa-t-shirt"
 * @returns {"commerce-core" | "marketing" | "commerce-display" | "unknown"}
 */
const TRAILING_SLASH_RE = /\/$/;

export function getSurfaceForPath(path) {
  const normalized = path.toLowerCase().replace(TRAILING_SLASH_RE, "") || "/";

  for (const route of SURFACES["commerce-core"].routes) {
    if (normalized === route || normalized.startsWith(route)) {
      return "commerce-core";
    }
  }

  for (const route of SURFACES.marketing.routes) {
    if (normalized === route || normalized.startsWith(route)) {
      return "marketing";
    }
  }

  return "unknown";
}

/**
 * Determine which surface a block slug belongs to.
 * @param {string} slug — e.g. "hero" or "productGrid"
 * @returns {"marketing" | "commerce-display" | "unknown"}
 */
export function getSurfaceForBlock(slug) {
  if (SURFACES.marketing.blockSlugs.includes(slug)) {
    return "marketing";
  }
  if (SURFACES["commerce-display"].blockSlugs.includes(slug)) {
    return "commerce-display";
  }
  return "unknown";
}

/**
 * Check if a structural change is allowed for a given path.
 * @param {string} path
 * @param {boolean} hasExplicitOverride — operator has confirmed the risk
 * @returns {{ allowed: boolean, surface: string, warning: string | null }}
 */
export function isStructuralChangeAllowed(path, hasExplicitOverride = false) {
  const surface = getSurfaceForPath(path);

  if (surface === "commerce-core") {
    if (hasExplicitOverride) {
      return {
        allowed: true,
        surface,
        warning: "⚠️ Proceeding with commerce-core structural change under explicit operator override. Document risk in PR description. Run conversion regression tests.",
      };
    }
    return {
      allowed: false,
      surface,
      warning: SURFACES["commerce-core"].overrideWarning,
    };
  }

  return { allowed: true, surface, warning: null };
}
