"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import {
  buildSafePageUrl,
  isAnyAnalyticsProviderConfigured,
  trackSiteSearchEvent,
} from "@/lib/analytics";

export default function SearchTracker({
  keyword,
  resultCount,
  category = false,
}: {
  keyword: string;
  resultCount: number;
  category?: string | false;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasAnalytics = useHasAnalyticsConsent();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!(hasAnalytics && isAnyAnalyticsProviderConfigured())) {
      return;
    }

    const term = keyword.trim();
    if (!term) {
      return;
    }

    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    const url = buildSafePageUrl(pathname, search);
    const key = `search:${term}:${resultCount}:${url}`;
    if (lastKey.current === key) {
      return;
    }
    lastKey.current = key;

    trackSiteSearchEvent({
      keyword: term,
      category,
      resultCount,
      url,
      title: `Search: ${term}`,
    });
  }, [hasAnalytics, pathname, searchParams, keyword, resultCount, category]);

  return null;
}
