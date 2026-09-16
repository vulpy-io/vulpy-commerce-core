export type PriceGateMode = "off" | "login" | "quote";

/**
 * Parse PRICE_GATE_MODE with legacy compatibility: when the mode is unset (or
 * invalid) and REQUIRE_LOGIN_FOR_PRICES=true, treat as `login`.
 */
function parsePriceGateMode(): PriceGateMode {
  const mode = (process.env.PRICE_GATE_MODE ?? "").trim().toLowerCase();
  if (mode === "login" || mode === "quote") {
    return mode;
  }
  if (mode === "off") {
    return "off";
  }
  if (process.env.REQUIRE_LOGIN_FOR_PRICES === "true") {
    return "login";
  }
  return "off";
}

const config = {
  defaultCountryCode: "us",
  customerAccountsEnabled:
    process.env.NEXT_PUBLIC_ENABLE_CUSTOMER_ACCOUNTS === "true",
  /** Commercial persona: which price-gating mode is active. */
  priceGateMode: parsePriceGateMode(),
  /** Legacy alias — true when `priceGateMode !== "off"`. */
  requireLoginForPrices: (() => parsePriceGateMode() !== "off")(),
};

export default config;