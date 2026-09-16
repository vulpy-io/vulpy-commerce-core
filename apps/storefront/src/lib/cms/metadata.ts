import type { Metadata } from "next";
import { formatSeoTitle } from "@/lib/seo/format-seo-title";
import { isSiteNoindex, withCanonical } from "@/lib/seo/metadata";
import { getPageBySlug, getSiteSettings, getUtilitySeo } from "./queries";

export async function generateUtilityMetadata(
  route: string,
  fallback: { title: string; description: string },
  options?: { noindex?: boolean; canonicalPath?: string }
): Promise<Metadata> {
  const settings = await getSiteSettings();
  const seo = getUtilitySeo(settings, route, fallback);
  const siteNoindex = isSiteNoindex();
  const metadata: Metadata = {
    title: formatSeoTitle(seo.title, settings.siteName),
    description: seo.description,
    ...(siteNoindex
      ? { robots: { index: false, follow: false } }
      : options?.noindex
        ? { robots: { index: false, follow: true } }
        : {}),
  };
  return withCanonical(metadata, options?.canonicalPath ?? route);
}

export async function generateCmsPageMetadata(slug: string): Promise<Metadata> {
  const [page, settings] = await Promise.all([getPageBySlug(slug), getSiteSettings()]);
  if (!page) {
    return { title: formatSeoTitle(slug, settings.siteName) };
  }
  return withCanonical(
    {
      title: formatSeoTitle(page.seo.title || page.title, settings.siteName),
      description: page.seo.description,
    },
    slug === "home" ? "/" : `/${slug}`
  );
}
