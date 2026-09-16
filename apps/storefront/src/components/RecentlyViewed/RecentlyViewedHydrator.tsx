"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { rehydrateSavedItemsAction } from "@/app/actions/saved-items";
import { useConsent } from "@/context/ConsentContext";
import { hydrateRecentlyViewed } from "@/redux/features/recently-viewed-slice";
import { type AppDispatch, useAppSelector } from "@/redux/store";

export const RECENTLY_VIEWED_STORAGE_KEY = "vulpy-recently-viewed";

export default function RecentlyViewedHydrator() {
  const dispatch = useDispatch<AppDispatch>();
  const items = useAppSelector((state) => state.recentlyViewedReducer.items);
  const { ready, choices } = useConsent();
  const canStore = ready && choices.preferences;
  const [isHydrated, setIsHydrated] = useState(false);
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!canStore) {
      window.localStorage.removeItem(RECENTLY_VIEWED_STORAGE_KEY);
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
    const stored = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
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
        window.localStorage.removeItem(RECENTLY_VIEWED_STORAGE_KEY);
      }
    }

    setIsHydrated(true);

    if (storedHandles.length > 0) {
      rehydrateSavedItemsAction(storedHandles)
        .then((rehydrated) => {
          if (rehydrated.length > 0) {
            dispatch(hydrateRecentlyViewed(rehydrated));
          }
        })
        .catch(() => {
          // Leave the list empty; nothing displayable without storage data.
        });
    }
  }, [dispatch, ready, canStore]);

  useEffect(() => {
    if (!(ready && isHydrated)) {
      return;
    }

    if (!canStore) {
      window.localStorage.removeItem(RECENTLY_VIEWED_STORAGE_KEY);
      return;
    }

    const handles = items
      .map((item) => item.handle)
      .filter((handle): handle is string => Boolean(handle));
    window.localStorage.setItem(
      RECENTLY_VIEWED_STORAGE_KEY,
      JSON.stringify(handles)
    );
  }, [items, isHydrated, ready, canStore]);

  return null;
}
