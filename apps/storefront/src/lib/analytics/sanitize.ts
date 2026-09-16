const SENSITIVE_QUERY_PARAMS = new Set([
  "email",
  "e-mail",
  "mail",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "password",
  "passwd",
  "pwd",
  "secret",
  "api_key",
  "apikey",
  "key",
  "auth",
  "authorization",
  "jwt",
  "session",
  "sid",
  "customer_id",
  "customerid",
  "order_id",
  "orderid",
  "phone",
  "address",
  "card",
  "cvv",
  "cvc",
]);

const ALLOWED_QUERY_PARAMS = new Set([
  "q",
  "query",
  "search",
  "sort",
  "page",
  "limit",
  "category",
  "categories",
  "color",
  "size",
  "price_min",
  "price_max",
  "tag",
  "tags",
  "on_sale",
  "sale",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

export function sanitizeSearchParams(
  search: string,
  options?: { allowlistOnly?: boolean }
): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) {
    return "";
  }

  const params = new URLSearchParams(raw);
  const next = new URLSearchParams();

  for (const [key, value] of Array.from(params.entries())) {
    const normalized = key.toLowerCase();
    if (SENSITIVE_QUERY_PARAMS.has(normalized)) {
      continue;
    }
    if (options?.allowlistOnly && !ALLOWED_QUERY_PARAMS.has(normalized)) {
      continue;
    }
    if (!value || value.length > 200) {
      continue;
    }
    next.append(key, value);
  }

  const serialized = next.toString();
  return serialized ? `?${serialized}` : "";
}

export function sanitizePathname(pathname: string): string {
  if (!pathname.startsWith("/")) {
    return "/";
  }
  // Drop trailing slash except root; strip fragment-like noise
  const cleaned = pathname.split("#")[0]?.split("?")[0] ?? "/";
  if (cleaned.length > 1 && cleaned.endsWith("/")) {
    return cleaned.slice(0, -1);
  }
  return cleaned || "/";
}

export function buildSafePageUrl(pathname: string, search = ""): string {
  return `${sanitizePathname(pathname)}${sanitizeSearchParams(search, {
    allowlistOnly: true,
  })}`;
}

/** FNV-1a 32-bit — stable non-cryptographic hash for analytics ids (never send raw Medusa ids). */
function fnv1aHex(value: string): string {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a mixing step
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: coerce to unsigned 32-bit
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Pseudonymize Medusa order id for Matomo (never send raw order_…). */
export function pseudonymizeOrderId(orderId: string): string {
  const normalized = orderId.trim();
  if (!normalized) {
    return "unknown";
  }
  return `ord_${fnv1aHex(normalized)}`;
}

/** Hashed GA4 user_id for logged-in customers (never send raw cus_…). */
export function hashAnalyticsUserId(customerId: string): string {
  const normalized = customerId.trim();
  if (!normalized) {
    return "";
  }
  return `uid_${fnv1aHex(normalized)}`;
}

export function stripPiiFromString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[redacted-phone]");
}
