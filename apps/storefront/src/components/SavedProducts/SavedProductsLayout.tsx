"use client";

import type { ReactNode } from "react";
import SavedProductsSummary from "./SavedProductsSummary";
import SavedProductsTable from "./SavedProductsTable";
import type { SavedProductListItem } from "./types";

export default function SavedProductsLayout({
  title,
  clearLabel,
  clearDisabled,
  onClear,
  items,
  regionId,
  getItemKey,
  removeAriaLabel,
  onRemove,
  summaryTitle,
  addToCartLabel,
  onAddToCartSuccess,
  emptyState,
}: {
  title?: string;
  clearLabel: string;
  clearDisabled: boolean;
  onClear: () => void;
  items: SavedProductListItem[];
  regionId: string;
  getItemKey: (item: SavedProductListItem) => string;
  removeAriaLabel: string;
  onRemove: (item: SavedProductListItem) => void;
  summaryTitle?: string;
  addToCartLabel?: string;
  onAddToCartSuccess?: (item: SavedProductListItem) => void;
  emptyState: ReactNode;
}) {
  const hasItems = items.length > 0;

  return (
    <section className="overflow-hidden bg-gray-2 py-20">
      <div className="container w-full">
        {hasItems ? (
          <div className="mb-7.5 flex flex-wrap items-center justify-between gap-5">
            {title ? (
              <h2 className="h2">{title}</h2>
            ) : null}
            <button
              className="text-content-brand disabled:text-content-muted"
              disabled={clearDisabled}
              onClick={onClear}
              type="button"
            >
              {clearLabel}
            </button>
          </div>
        ) : null}

        {hasItems ? (
          <>
            <SavedProductsTable
              addToCartLabel={addToCartLabel}
              getItemKey={getItemKey}
              items={items}
              onAddToCartSuccess={onAddToCartSuccess}
              onRemove={onRemove}
              regionId={regionId}
              removeAriaLabel={removeAriaLabel}
            />

            {summaryTitle ? (
              <div className="mt-9 flex flex-col gap-7.5 lg:flex-row lg:justify-end xl:gap-11">
                <SavedProductsSummary items={items} title={summaryTitle} />
              </div>
            ) : null}
          </>
        ) : (
          emptyState
        )}
      </div>
    </section>
  );
}