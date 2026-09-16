// Core stub (R1f) — Pro quote-request server action excluded from the public
// Core tree. Neutral behavior: returns a failure (quotation is a Pro
// capability). Same exported symbols as the Pro module it replaces.
export type SubmitQuoteRequestResult =
  | { ok: true; draftOrderId: string }
  | { ok: false; error: string };

/**
 * Core stub — quotation is a Pro capability. Always reports the flow as
 * unavailable without side effects.
 */
export function submitQuoteRequestAction(
  cartId: string
): Promise<SubmitQuoteRequestResult> {
  return Promise.resolve(
    cartId
      ? { ok: false, error: "Quotation requests are not available in this edition" }
      : { ok: false, error: "No cart found to submit a quote request" }
  );
}
