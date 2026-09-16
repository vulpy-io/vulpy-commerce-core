"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import {
  buildSafePageUrl,
  isAnyAnalyticsProviderConfigured,
  trackPageViewEvent,
} from "@/lib/analytics";

/**
 * Emits one virtual pageview per pathname/search transition after consent.
 * Specialized routes (PDP, search, purchase) should skip the default pageview.
 */
export default function PageViewTracker({
  skip = false,
}: {
  skip?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasAnalytics = useHasAnalyticsConsent();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!(hasAnalytics && isAnyAnalyticsProviderConfigured()) || skip) {
      return;
    }

    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    const url = buildSafePageUrl(pathname, search);
    const key = url;
    if (lastKey.current === key) {
      return;
    }
    lastKey.current = key;
    trackPageViewEvent(url, typeof document === "undefined" ? undefined : document.title);
  }, [hasAnalytics, pathname, searchParams, skip]);

  return null;
}
