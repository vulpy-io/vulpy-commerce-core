// Core stub (R1f) — Pro price-persona CTA logic excluded from the public Core
// tree. Core has a single public persona: everyone can see prices and adds to
// cart. Same exported symbols as the Pro module it replaces.
export interface AddActionState {
  canSeePrices: boolean;
  inStock: boolean;
  pending: boolean;
}

/** Core always shows "Add to cart" for in-stock products. */
export function getAddActionLabel({
  inStock,
  pending,
}: AddActionState): string {
  if (pending) {
    return "Adding...";
  }
  if (!inStock) {
    return "Out of stock";
  }
  return "Add to cart";
}

export type AddCtaType = "add_to_cart" | "add_to_quotation" | "login";

/**
 * Core has a single persona — everyone can see prices. Signature mirrors the
 * Pro module (persona is accepted for call-site compatibility and ignored).
 */
export function resolveAddCta(
  canSeePrices: boolean,
  _persona: "public" | "login" | "quote"
): AddCtaType {
  return canSeePrices ? "add_to_cart" : "login";
}
