// Core stub (R1f) — Pro price-gate configuration excluded from the public Core
// tree. Core is always "off": prices are public, no gating. Same exported
// symbols as the Pro module it replaces.
export type PriceGateMode = "off" | "login" | "quote";

/** Core never gates prices. */
export function getPriceGateMode(): PriceGateMode {
  return "off";
}

/** Core has no price gating. */
export function isPriceGatingEnabled(): boolean {
  return false;
}

/** Core never requires login to view prices. */
export function isRequireLoginForPricesEnabled(): boolean {
  return false;
}
