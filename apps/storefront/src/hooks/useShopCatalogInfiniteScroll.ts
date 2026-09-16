"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadShopCatalogPageAction,
  type ShopCatalogPageActionResult,
  type ShopCatalogScope,
} from "@/app/actions/shop-catalog";
import {
  isDeepPageDedupeActive,
  shouldAppendNextPage,
} from "@/lib/medusa/shop-catalog-pagination";
import type { ShopSortValue } from "@/lib/medusa/shop-display";
import type { ShopFilters, ShopProduct } from "@/types/shop";

export function useShopCatalogInfiniteScroll(input: {
  initialProducts: ShopProduct[];
  initialPage: number;
  totalPages: number;
  sort: ShopSortValue;
  filters: ShopFilters;
  categoryHandle?: string;
  catalogScope?: ShopCatalogScope;
  selectionHandle?: string;
}) {
  const {
    initialProducts,
    initialPage,
    totalPages,
    sort,
    filters,
    categoryHandle,
    catalogScope,
    selectionHandle,
  } = input;

  const [visibleProducts, setVisibleProducts] = useState(initialProducts);
  const [loadedPage, setLoadedPage] = useState(initialPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [dedupeActive, setDedupeActive] = useState(initialPage > 1);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const preloadRef = useRef<Promise<ShopCatalogPageActionResult | null> | null>(null);
  const preloadPageRef = useRef<number | null>(null);
  const loadingRef = useRef(false);

  const isDeepLanding = initialPage > 1;
  const scopeKey = `${sort}|${filters.categoryIds.join(",")}|${filters.sizes.join(",")}|${filters.colors.join(",")}|${filters.finishes.join(",")}|${filters.saleOnly ? "1" : "0"}|${categoryHandle ?? ""}|${selectionHandle ?? ""}`;

  useEffect(() => {
    setVisibleProducts(initialProducts);
    setLoadedPage(initialPage);
    setDedupeActive(initialPage > 1);
    preloadRef.current = null;
    preloadPageRef.current = null;
  }, [initialProducts, initialPage, sort, filters, scopeKey]);

  const fetchPage = useCallback(
    (page: number) =>
      loadShopCatalogPageAction({
        categoryHandle,
        catalogScope,
        selectionHandle,
        page,
        sort,
        filters,
      }),
    [catalogScope, categoryHandle, selectionHandle, filters, sort]
  );

  useEffect(() => {
    if (loadedPage >= totalPages) {
      preloadRef.current = null;
      preloadPageRef.current = null;
      return;
    }

    const nextPage = loadedPage + 1;
    preloadPageRef.current = nextPage;
    preloadRef.current = fetchPage(nextPage);
  }, [fetchPage, loadedPage, totalPages]);

  const appendPage = useCallback(
    async (page: number) => {
      if (page > totalPages || loadingRef.current) {
        return;
      }
      if (!shouldAppendNextPage({ isDedupeActive: dedupeActive, loadedPage, totalPages })) {
        return;
      }

      loadingRef.current = true;
      setIsLoadingMore(true);

      try {
        let result: ShopCatalogPageActionResult | null = null;

        if (preloadPageRef.current === page && preloadRef.current) {
          result = await preloadRef.current;
        } else {
          result = await fetchPage(page);
        }

        if (!result?.products.length) {
          return;
        }

        const dedupe = isDeepPageDedupeActive({
          isDedupeActive: dedupeActive,
          isDeepLanding,
          hasAppended: loadedPage > initialPage,
        });

        if (dedupe) {
          const loadedIds = new Set(visibleProducts.map((item) => item.productId ?? item.id));
          result.products = result.products.filter(
            (item) => !loadedIds.has(item.productId ?? item.id)
          );
        }

        setVisibleProducts((current) => {
          const existingIds = new Set(current.map((item) => item.productId ?? item.id));
          const nextItems = result.products.filter(
            (item) => !existingIds.has(item.productId ?? item.id)
          );
          return [...current, ...nextItems];
        });
        setLoadedPage(result.currentPage);
      } finally {
        loadingRef.current = false;
        setIsLoadingMore(false);
        preloadRef.current = null;
        preloadPageRef.current = null;
      }
    },
    [dedupeActive, fetchPage, initialPage, isDeepLanding, loadedPage, totalPages, visibleProducts]
  );

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || loadedPage >= totalPages) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          appendPage(loadedPage + 1);
        }
      },
      { rootMargin: "320px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [appendPage, loadedPage, totalPages, visibleProducts.length]);

  return {
    visibleProducts,
    loadedPage,
    isLoadingMore,
    hasMore: loadedPage < totalPages,
    loadMoreRef,
  };
}