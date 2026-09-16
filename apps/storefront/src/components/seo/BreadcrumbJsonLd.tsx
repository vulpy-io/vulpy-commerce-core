import type { BreadcrumbItem } from "@/components/Common/Breadcrumb";
import {
  buildBreadcrumbListJsonLd,
  serializeJsonLd,
} from "@/lib/seo/breadcrumb-jsonld";

type BreadcrumbJsonLdProps = {
  items: BreadcrumbItem[];
  currentPath?: string;
};

export default function BreadcrumbJsonLd({
  items,
  currentPath,
}: BreadcrumbJsonLdProps) {
  if (items.length === 0) {
    return null;
  }

  const jsonLd = buildBreadcrumbListJsonLd(items, { currentPath });

  return (
    <script type="application/ld+json">{serializeJsonLd(jsonLd)}</script>
  );
}
