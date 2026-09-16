import Link from "next/link";
import { getLoadedPageHref } from "@/components/Shop/CatalogPaginationState";
import type { ShopSortValue } from "@/lib/medusa/shop-display";
import { buildShopCatalogHref } from "@/lib/medusa/shop-query";
import type { ShopFilters } from "@/types/shop";

function pageWindow(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
}

const pageLinkClass =
  "inline-flex min-w-11 h-11 items-center justify-center border border-border-subtle bg-surface-raised px-2 text-[13px] text-content-secondary duration-200 ease-out hover:border-content-primary hover:text-content-primary";

const edgeLinkClass = `${pageLinkClass} px-[18px] text-[11px] font-bold tracking-[0.06em] uppercase`;

const disabledEdgeClass =
  "inline-flex min-w-11 h-11 cursor-default items-center justify-center border border-border-subtle bg-surface-raised px-[18px] text-[11px] font-bold tracking-[0.06em] uppercase text-content-muted opacity-40";

export default function CatalogPagination({
  catalogPath,
  currentPage,
  totalPages,
  sort,
  filters,
  priceDefaults,
  loadedPage,
}: {
  catalogPath: string;
  currentPage: number;
  totalPages: number;
  sort: ShopSortValue;
  filters: ShopFilters;
  priceDefaults: { priceMin: number; priceMax: number };
  /** Page the infinite-scroll hook has actually loaded (≥ currentPage). */
  loadedPage?: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const activePage = Math.max(currentPage, Math.min(loadedPage ?? currentPage, totalPages));
  const pages = pageWindow(activePage, totalPages);

  const nextHref = getLoadedPageHref(catalogPath, {
    loadedPage: activePage,
    totalPages,
    sort,
    filters,
    priceDefaults,
  });

  const prevHref =
    activePage > 1
      ? getLoadedPageHref(catalogPath, {
          loadedPage: activePage - 1,
          totalPages,
          sort,
          filters,
          priceDefaults,
        })
      : null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-14 flex flex-wrap items-center justify-center gap-2"
    >
      {activePage > 1 ? (
        <Link className={edgeLinkClass} href={prevHref ?? ""} scroll={false}>
          ← Prev
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledEdgeClass}>
          ← Prev
        </span>
      )}

      {pages.map((page, index) => {
        const prev = pages[index - 1];
        const showEllipsis = prev != null && page - prev > 1;
        const href = buildShopCatalogHref(catalogPath, {
          page,
          sort,
          filters,
          priceDefaults,
        });
        const isCurrent = page === activePage;
        return (
          <span className="contents" key={page}>
            {showEllipsis ? (
              <span aria-hidden className="px-1 text-content-muted">
                …
              </span>
            ) : null}
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "inline-flex h-11 min-w-11 items-center justify-center border border-content-primary bg-action-primary-background px-2 text-[13px] text-white"
                  : pageLinkClass
              }
              href={href}
              scroll={false}
            >
              {page}
            </Link>
          </span>
        );
      })}

      {nextHref ? (
        <Link className={edgeLinkClass} href={nextHref} scroll={false}>
          Next →
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledEdgeClass}>
          Next →
        </span>
      )}
      {loadedPage != null && loadedPage > 1 ? (
        <p className="w-full text-center text-[11px] text-content-muted">
          Loaded {Math.min(activePage, totalPages)} of {totalPages} pages
        </p>
      ) : null}
    </nav>
  );
}