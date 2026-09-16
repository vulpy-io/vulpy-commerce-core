"use client";

import Link from "next/link";
import { useDispatch } from "react-redux";
import SavedProductsLayout from "@/components/SavedProducts/SavedProductsLayout";
import {
  removeAllItemsFromWishlist,
  removeItemFromWishlist,
} from "@/redux/features/wishlist-slice";
import { type AppDispatch, useAppSelector } from "@/redux/store";
import PageLayout from "../Common/PageLayout";

export const Wishlist = ({ regionId }: { regionId: string }) => {
  const dispatch = useDispatch<AppDispatch>();
  const items = useAppSelector((state) => state.wishlistReducer.items);

  return (
    <PageLayout title="Wishlist">
      <SavedProductsLayout
        addToCartLabel="Move to cart"
        clearDisabled={items.length === 0}
        clearLabel="Clear list"
        emptyState={
          <div className="rounded-panel bg-white py-20 text-center shadow-1">
            <p className="pb-6 text-content-muted">Your wishlist is empty.</p>
            <Link
              className="mx-auto inline-flex justify-center rounded-md bg-surface-inverse px-6 py-[13px] font-semibold text-white duration-200 ease-out hover:bg-surface-inverse/95"
              href="/shop"
            >
              Browse the shop
            </Link>
          </div>
        }
        getItemKey={(item) => item.id}
        items={items}
        onAddToCartSuccess={(item) => dispatch(removeItemFromWishlist(item.id))}
        onClear={() => dispatch(removeAllItemsFromWishlist())}
        onRemove={(item) => dispatch(removeItemFromWishlist(item.id))}
        regionId={regionId}
        removeAriaLabel="Remove from wishlist"
        summaryTitle="Summary"
      />
    </PageLayout>
  );
};
