"use client";

import { useCanSeePrices } from "@/context/AuthContext";
import SavedProductRow from "./SavedProductRow";
import type { SavedProductListItem } from "./types";

export default function SavedProductsTable({
  items,
  regionId,
  getItemKey,
  removeAriaLabel,
  onRemove,
  addToCartLabel,
  onAddToCartSuccess,
}: {
  items: SavedProductListItem[];
  regionId: string;
  getItemKey: (item: SavedProductListItem) => string;
  removeAriaLabel: string;
  onRemove: (item: SavedProductListItem) => void;
  addToCartLabel?: string;
  onAddToCartSuccess?: (item: SavedProductListItem) => void;
}) {
  const canSeePrices = useCanSeePrices();

  if (!items.length) {
    return null;
  }

  return (
    <div className="rounded-panel bg-white shadow-1">
      <div className="hidden w-full overflow-x-auto lg:block">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-gray-3 border-b">
              <th className="w-[83px] px-10 py-5.5" />
              <th className="px-4 py-5.5 text-left font-normal text-content-primary">Product</th>
              {canSeePrices ? (
                <th className="w-[205px] px-4 py-5.5 text-center font-normal text-content-primary">
                  Unit price
                </th>
              ) : null}
              <th className="w-[200px] px-10 py-5.5 text-center font-normal text-content-primary">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <SavedProductRow
                addToCartLabel={addToCartLabel}
                item={item}
                key={getItemKey(item)}
                onAddToCartSuccess={
                  onAddToCartSuccess ? () => onAddToCartSuccess(item) : undefined
                }
                onRemove={() => onRemove(item)}
                regionId={regionId}
                removeAriaLabel={removeAriaLabel}
                variant="table"
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-gray-3 lg:hidden">
        {items.map((item) => (
          <SavedProductRow
            addToCartLabel={addToCartLabel}
            item={item}
            key={getItemKey(item)}
            onAddToCartSuccess={
              onAddToCartSuccess ? () => onAddToCartSuccess(item) : undefined
            }
            onRemove={() => onRemove(item)}
            regionId={regionId}
            removeAriaLabel={removeAriaLabel}
            variant="card"
          />
        ))}
      </div>
    </div>
  );
}