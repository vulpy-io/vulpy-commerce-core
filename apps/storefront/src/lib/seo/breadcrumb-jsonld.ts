import {
  type BreadcrumbItem,
  formatBreadcrumbLabel,
} from "@/components/Common/Breadcrumb";
import { getSiteUrl, toAbsoluteUrl } from "./site-url";

const HOME_LABEL = "Home";

type BuildBreadcrumbJsonLdOptions = {
  currentPath?: string;
};

export function buildBreadcrumbListJsonLd(
  trailItems: BreadcrumbItem[],
  options?: BuildBreadcrumbJsonLdOptions
): Record<string, unknown> {
  const siteUrl = getSiteUrl();
  const items: BreadcrumbItem[] = [
    { label: HOME_LABEL, href: "/" },
    ...trailItems,
  ];

  if (options?.currentPath) {
    const lastIndex = items.length - 1;
    const lastItem = items[lastIndex];

    if (lastItem && !lastItem.href) {
      items[lastIndex] = {
        ...lastItem,
        href: options.currentPath,
      };
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const listItem: Record<string, unknown> = {
        "@type": "ListItem",
        position: index + 1,
        name: formatBreadcrumbLabel(item.structuredLabel ?? item.label),
      };

      if (item.href) {
        listItem.item = toAbsoluteUrl(item.href, siteUrl);
      }

      return listItem;
    }),
  };
}

export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
