"use client";

import Link from "next/link";
import { useDispatch } from "react-redux";
import SavedProductsLayout from "@/components/SavedProducts/SavedProductsLayout";
import { clearRecentlyViewed, removeRecentlyViewed } from "@/redux/features/recently-viewed-slice";
import { type AppDispatch, useAppSelector } from "@/redux/store";
import PageLayout from "../Common/PageLayout";

export const RecentlyViewed = ({ regionId }: { regionId: string }) => {
  const dispatch = useDispatch<AppDispatch>();
  const items = useAppSelector((state) => state.recentlyViewedReducer.items);

  return (
    <PageLayout title="Recently viewed">
      <SavedProductsLayout
        clearDisabled={items.length === 0}
        clearLabel="Clear list"
        emptyState={
          <div className="rounded-panel bg-white py-20 text-center shadow-1">
            <p className="pb-6 text-content-muted">You have not viewed any products yet.</p>
            <Link
              className="mx-auto inline-flex justify-center rounded-md bg-surface-inverse px-6 py-[13px] font-semibold text-white duration-200 ease-out hover:bg-surface-inverse/95"
              href="/shop"
            >
              Browse the shop
            </Link>
          </div>
        }
        getItemKey={(item) => item.handle}
        items={items}
        onClear={() => dispatch(clearRecentlyViewed())}
        onRemove={(item) => dispatch(removeRecentlyViewed(item.handle))}
        regionId={regionId}
        removeAriaLabel="Remove from recently viewed"
        title="Recently viewed"
      />
    </PageLayout>
  );
};
