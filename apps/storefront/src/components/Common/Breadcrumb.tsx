import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  /** Medusa category handle — used server-side to resolve Payload H1 for JSON-LD. */
  categoryHandle?: string;
  /** Overrides `label` in BreadcrumbList JSON-LD only (visible trail keeps `label`). */
  structuredLabel?: string;
};

export function formatBreadcrumbLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

type BreadcrumbProps = {
  title?: string;
  pages?: string[];
  items?: BreadcrumbItem[];
  variant?: "default" | "compact";
};

function BreadcrumbLabel({ item }: { item: BreadcrumbItem }) {
  const className = "inline-block max-w-[12rem] truncate align-bottom sm:max-w-[16rem] font-semibold";

  if (item.href) {
    return (
      <Link className={`hover:text-content-brand ${className}`} href={item.href} title={item.label}>
        {formatBreadcrumbLabel(item.label)}
      </Link>
    );
  }

  return (
    <span className={className} title={item.label}>
      {formatBreadcrumbLabel(item.label)}
    </span>
  );
}

function BreadcrumbTrail({
  items,
  pages = [],
}: {
  items?: BreadcrumbItem[];
  pages?: string[];
}) {
  const trailItems: BreadcrumbItem[] =
    items ??
    pages.map((page) => ({
      label: page,
    }));

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2">
        <li className="font-semibold text-custom-sm hover:text-content-brand">
          <Link href="/">Home</Link>
        </li>

        {trailItems.map((item, key) => (
          <li
            className="flex items-center gap-2 text-custom-sm last:text-content-brand"
            key={`${item.label}-${key}`}
          >
            <span aria-hidden="true">/</span>
            <BreadcrumbLabel item={item} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

const Breadcrumb = ({
  title,
  pages = [],
  items,
  variant = "default",
}: BreadcrumbProps) => {
  if (variant === "compact") {
    return (
      <div className="overflow-hidden pt-[var(--header-height)]">
        <div className="container w-full py-4 xl:py-5">
          <BreadcrumbTrail items={items} pages={pages} />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden pt-[var(--header-height)] shadow-breadcrumb">
      <div className="border-gray-3 border-t">
        <div className="container w-full py-4 xl:py-10">
          <div className="flex flex-col gap-3">
            <BreadcrumbTrail items={items} pages={pages} />

            {title ? (
              <h1 className="h1">
                {title}
              </h1>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Breadcrumb;
