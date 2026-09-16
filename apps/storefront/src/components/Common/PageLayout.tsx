import type { ReactNode } from "react";
import BreadcrumbJsonLd from "../seo/BreadcrumbJsonLd";
import Breadcrumb, { type BreadcrumbItem, formatBreadcrumbLabel } from "./Breadcrumb";

type PageLayoutProps = {
  title?: string;
  pages?: string[];
  breadcrumbItems?: BreadcrumbItem[];
  breadcrumbCurrentPath?: string;
  breadcrumbVariant?: "default" | "compact";
  includeBreadcrumbJsonLd?: boolean;
  children: ReactNode;
};

export function breadcrumbLabel(title: string): string {
  return formatBreadcrumbLabel(title);
}

function resolveBreadcrumbItems(
  breadcrumbItems: BreadcrumbItem[] | undefined,
  pages: string[] | undefined,
  title: string
): BreadcrumbItem[] {
  if (breadcrumbItems) {
    return breadcrumbItems;
  }

  if (pages && pages.length > 0) {
    return pages
      .filter((page) => page !== "/")
      .map((page) => ({ label: page }));
  }

  if (title) {
    return [{ label: breadcrumbLabel(title) }];
  }

  return [];
}

export default function PageLayout({
  title = "",
  pages,
  breadcrumbItems,
  breadcrumbCurrentPath,
  breadcrumbVariant = "default",
  includeBreadcrumbJsonLd = true,
  children,
}: PageLayoutProps) {
  const resolvedBreadcrumbItems = resolveBreadcrumbItems(
    breadcrumbItems,
    pages,
    title
  );

  return (
    <main>
      {includeBreadcrumbJsonLd ? (
        <BreadcrumbJsonLd
          currentPath={breadcrumbCurrentPath}
          items={resolvedBreadcrumbItems}
        />
      ) : null}
      <Breadcrumb
        items={breadcrumbItems}
        pages={
          breadcrumbItems
            ? undefined
            : pages ?? (title ? [breadcrumbLabel(title)] : [])
        }
        title={breadcrumbVariant === "compact" ? undefined : title}
        variant={breadcrumbVariant}
      />
      {children}
    </main>
  );
}

export type { BreadcrumbItem };
