// Core stub (R1f) — Pro price-guard capability excluded from the public Core
// tree. Neutral behavior: prices are never stripped in Core, and the guard
// mounts no routes. Same exported symbols as the Pro module it replaces.
import {
  authenticate,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
} from "@medusajs/framework/http";

/** Core has no price gating — payloads pass through untouched. */
export function sanitizePriceData(value: unknown): unknown {
  return value;
}

/** Core mounts no price-guard routes. */
export function getPriceGuardMiddlewares(): MiddlewareRoute[] {
  return [];
}

/** Guests always see prices in Core — pass through. */
export function stripPricesForGuests(
  _req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): void {
  next();
}

/**
 * Core-safe authentication middleware, faithful to the Pro module.
 *
 * The Pro module builds this from Medusa's `authenticate("customer", ...)`.
 * Core has no price gating and no quotation flow, but `shop/middlewares.ts`
 * puts this symbol in a real middleware chain — so it MUST be a callable
 * middleware, never `null` (Medusa's wrapHandler crashes on `null` at boot,
 * release defect #208). Core keeps the same customer auth so the account
 * area gets `req.auth_context`; only the price stripping is disabled.
 */
export const authenticateOptionalCustomer = authenticate(
  "customer",
  ["session", "bearer"],
  { allowUnauthenticated: true }
);
