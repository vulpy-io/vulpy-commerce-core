import type { CmsSiteSettings } from "@/lib/cms/types";
import { toAbsoluteUrl } from "./site-url";

export function buildHomeJsonLd(settings: CmsSiteSettings) {
  const url = toAbsoluteUrl("/");
  const logo = settings.logoUrl ? toAbsoluteUrl(settings.logoUrl) : undefined;
  const sameAs = settings.socialLinks.map((link) => link.url).filter(Boolean);
  const phone =
    settings.supportPhone || settings.contactInfo.phone || undefined;

  const onlineStore = {
    "@type": "OnlineStore",
    name: settings.siteName,
    url,
    ...(logo ? { logo } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            telephone: phone,
            contactType: "customer service",
          },
        }
      : {}),
  };

  const website = {
    "@type": "WebSite",
    name: settings.siteName,
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${toAbsoluteUrl("/search")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const graph: Record<string, unknown>[] = [onlineStore, website];

  const showroom = settings.showroom;
  if (
    showroom?.enabled &&
    showroom.streetAddress &&
    showroom.addressLocality &&
    showroom.addressCountry
  ) {
    graph.push({
      "@type": showroom.type || "Store",
      name: showroom.name || settings.siteName,
      url,
      ...(phone || showroom.telephone
        ? { telephone: showroom.telephone || phone }
        : {}),
      address: {
        "@type": "PostalAddress",
        streetAddress: showroom.streetAddress,
        addressLocality: showroom.addressLocality,
        addressRegion: showroom.addressRegion || undefined,
        postalCode: showroom.postalCode || undefined,
        addressCountry: showroom.addressCountry,
      },
      ...(showroom.latitude != null && showroom.longitude != null
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: showroom.latitude,
              longitude: showroom.longitude,
            },
          }
        : {}),
      ...(showroom.openingHours
        ? { openingHours: showroom.openingHours }
        : {}),
      parentOrganization: { "@type": "OnlineStore", name: settings.siteName, url },
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function buildCollectionPageJsonLd(input: {
  name: string;
  description?: string;
  path: string;
  /** When > 1, the JSON-LD url self-canonicalizes to `path?page=N`. */
  page?: number;
  items: Array<{ name: string; path: string }>;
}) {
  const url = input.page && input.page > 1 ? `${input.path}?page=${input.page}` : input.path;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: toAbsoluteUrl(url),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: input.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: toAbsoluteUrl(item.path),
        name: item.name,
      })),
    },
  };
}

export function buildBlogPostingJsonLd(input: {
  headline: string;
  description?: string;
  path: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  publisherName: string;
  publisherLogo?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    description: input.description,
    url: toAbsoluteUrl(input.path),
    ...(input.image ? { image: [toAbsoluteUrl(input.image)] } : {}),
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    ...(input.authorName
      ? { author: { "@type": "Person", name: input.authorName } }
      : {}),
    publisher: {
      "@type": "Organization",
      name: input.publisherName,
      ...(input.publisherLogo
        ? { logo: { "@type": "ImageObject", url: toAbsoluteUrl(input.publisherLogo) } }
        : {}),
    },
  };
}

export function buildBlogJsonLd(input: {
  name: string;
  description?: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: input.name,
    description: input.description,
    url: toAbsoluteUrl(input.path),
  };
}

export function buildFaqPageJsonLd(
  items: Array<{ question: string; answer: string }>
) {
  if (!items.length) {
    return null;
  }
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
