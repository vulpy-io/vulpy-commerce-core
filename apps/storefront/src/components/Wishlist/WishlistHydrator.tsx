"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { rehydrateSavedItemsAction } from "@/app/actions/saved-items";
import { useConsent } from "@/context/ConsentContext";
import { hydrateWishlist } from "@/redux/features/wishlist-slice";
import { type AppDispatch, useAppSelector } from "@/redux/store";

export const WISHLIST_STORAGE_KEY = "vulpy-wishlist";

export default function WishlistHydrator() {
  const dispatch = useDispatch<AppDispatch>();
  const wishlistItems = useAppSelector((state) => state.wishlistReducer.items);
  const { ready, choices } = useConsent();
  const canStore = ready && choices.preferences;
  const [isHydrated, setIsHydrated] = useState(false);
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!canStore) {
      window.localStorage.removeItem(WISHLIST_STORAGE_KEY);
      setIsHydrated(true);
      return;
    }

    if (hasLoaded.current) {
      setIsHydrated(true);
      return;
    }
    hasLoaded.current = true;

    // Storage holds only product handles — no names, images, or prices. Full
    // items are rebuilt from Medusa below, so prices/stock never go stale.
    const stored = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    let storedHandles: string[] = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          storedHandles = parsed.filter(
            (handle): handle is string => typeof handle === "string" && Boolean(handle)
          );
        }
      } catch {
        window.localStorage.removeItem(WISHLIST_STORAGE_KEY);
      }
    }

    setIsHydrated(true);

    if (storedHandles.length > 0) {
      rehydrateSavedItemsAction(storedHandles)
        .then((items) => {
          if (items.length > 0) {
            dispatch(hydrateWishlist(items));
          }
        })
        .catch(() => {
          // Leave the wishlist empty; nothing displayable without storage data.
        });
    }
  }, [dispatch, ready, canStore]);

  useEffect(() => {
    if (!(ready && isHydrated)) {
      return;
    }

    if (!canStore) {
      window.localStorage.removeItem(WISHLIST_STORAGE_KEY);
      return;
    }

    const handles = wishlistItems
      .map((item) => item.handle)
      .filter((handle): handle is string => Boolean(handle));
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(handles));
  }, [wishlistItems, isHydrated, ready, canStore]);

  return null;
}
