import type { Metadata } from "next";
import { isSiteNoindex } from "./site-noindex";
import { getSiteUrl, toAbsoluteUrl } from "./site-url";

export { isSiteNoindex } from "./site-noindex";

export function getGoogleSiteVerification(): string | undefined {
  const value = (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "").trim();
  return value || undefined;
}

/** BCP 47 / html lang — monolingual shops set e.g. `uk` without full i18n. */
export function getDefaultLocale(): string {
  const value = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "en").trim();
  return value || "en";
}

/**
 * hreflang scaffold: returns undefined for monolingual shops (default).
 * Only emits alternates when NEXT_PUBLIC_HREFLANG_ENABLED=1 and 2+ locales
 * are listed in NEXT_PUBLIC_SITE_LOCALES — and only after real locale URLs exist.
 * Do not enable with fake same-URL alternates.
 */
export function languageAlternates(
  _path: string
): Record<string, string> | undefined {
  const enabled = (process.env.NEXT_PUBLIC_HREFLANG_ENABLED ?? "")
    .trim()
    .toLowerCase();
  if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
    return undefined;
  }
  const locales = (process.env.NEXT_PUBLIC_SITE_LOCALES ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (locales.length < 2) {
    return undefined;
  }
  // Real locale-prefixed routes are a separate epic — refuse to invent URLs.
  return undefined;
}

/** Absolute canonical for a clean path (no query). */
export function canonicalForPath(path: string): string {
  return toAbsoluteUrl(path.split("?")[0] || "/");
}

/**
 * Listing canonical: self with ?page=N when N>=2; strip filter/sort/price params.
 */
export function canonicalForListing(path: string, page?: number): string {
  const base = canonicalForPath(path);
  if (page && page > 1) {
    return `${base}?page=${page}`;
  }
  return base;
}

export function rootSiteMetadata(): Metadata {
  const verification = getGoogleSiteVerification();
  return {
    metadataBase: new URL(getSiteUrl()),
    ...(isSiteNoindex() ? { robots: { index: false, follow: false } } : {}),
    ...(verification ? { verification: { google: verification } } : {}),
  };
}

export function withCanonical(
  metadata: Metadata,
  canonicalPath: string
): Metadata {
  const languages = languageAlternates(canonicalPath);
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical: canonicalPath.startsWith("http")
        ? canonicalPath
        : canonicalForPath(canonicalPath),
      ...(languages ? { languages } : {}),
    },
  };
}

export function withNoindex(metadata: Metadata): Metadata {
  // Page-level noindex normally allows follow; sitewide lock must keep nofollow.
  return {
    ...metadata,
    robots: { index: false, follow: !isSiteNoindex() },
  };
}

export function listingTitleSuffix(title: string, page?: number): string {
  if (page && page > 1) {
    return `${title} – Page ${page}`;
  }
  return title;
}

export function buildSocialMetadata(input: {
  title: string;
  description?: string;
  url: string;
  siteName?: string;
  images?: string[];
  type?: "website" | "article";
}): Pick<Metadata, "openGraph" | "twitter"> {
  const images = (input.images ?? [])
    .map((src) => toAbsoluteUrl(src))
    .filter(Boolean);
  const url = input.url.startsWith("http")
    ? input.url
    : canonicalForPath(input.url);

  return {
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: input.siteName,
      type: input.type ?? "website",
      ...(images.length ? { images } : {}),
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      ...(images.length ? { images } : {}),
    },
  };
}
