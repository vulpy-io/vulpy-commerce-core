// Core stub (R1f) — Pro quotation i18n excluded from the public Core tree.
// Core has a single persona (public prices), so quotation copy is absent.
// Re-exports the shared storefront dictionary for symbol parity.
export { storefrontEn } from "@/i18n/en";

/** Neutral quotation copy for Core (quotation is a Pro capability). */
export const quotationEn = {
  addToQuotation: "Add to cart",
  addingToQuotation: "Adding...",
  quotationBagLabel: "Cart",
  requestAQuote: "Request a Quote",
  submitQuoteRequest: "Submit quote request",
  guestTradeNote: "",
} as const;
