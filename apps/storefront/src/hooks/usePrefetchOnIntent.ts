"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

export function usePrefetchOnIntent(href: string) {
  const router = useRouter();
  const prefetchedRef = useRef(false);

  const prefetch = useCallback(() => {
    if (prefetchedRef.current || !href || href.startsWith("http")) {
      return;
    }
    prefetchedRef.current = true;
    router.prefetch(href);
  }, [href, router]);

  return {
    onMouseEnter: prefetch,
    onTouchStart: prefetch,
  };
}
