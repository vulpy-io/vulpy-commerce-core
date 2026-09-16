/** Truthy check for crawl-lock env flags (`1` / `true` / `yes`). */
export function isTruthyEnvFlag(raw: string | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Staging / preview crawl lock via server `SITE_NOINDEX` (runtime — restart
 * storefront after changing; no image rebuild).
 */
export function isSiteNoindex(): boolean {
  return isTruthyEnvFlag(process.env.SITE_NOINDEX);
}
