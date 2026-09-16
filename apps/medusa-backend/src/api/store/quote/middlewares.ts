// Core stub (R1f) — Pro quote-order middleware capability excluded from the
// public Core tree. Core mounts no quotation routes and exposes no draft-order
// flow. Same exported symbols as the Pro module it replaces.
import type { MiddlewareRoute } from "@medusajs/framework/http";

export interface SubmitQuoteRequestBody {
  cart_id: string;
}

/**
 * Core stub validator. Quotation is a Pro capability; the Core module never
 * accepts a quote submission.
 */
export function parseSubmitQuoteBody(body: unknown):
  | { ok: true; data: SubmitQuoteRequestBody }
  | { ok: false; message: string } {
  const candidate = body as { cart_id?: unknown } | null;
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, message: "Request body is required" };
  }
  if (
    typeof candidate.cart_id !== "string" ||
    candidate.cart_id.trim().length === 0
  ) {
    return { ok: false, message: "cart_id must be a non-empty string" };
  }
  return { ok: true, data: { cart_id: candidate.cart_id.trim() } };
}

/** Core mounts no quote-request routes. */
export const quoteOrderMiddlewares: MiddlewareRoute[] = [];
