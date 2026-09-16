"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import {
  buildSafePageUrl,
  isAnyAnalyticsProviderConfigured,
  trackPageViewEvent,
  trackViewItem,
} from "@/lib/analytics";

export default function ProductViewTracker({
  productSku,
  productName,
  category,
  brand,
  price,
  currency,
}: {
  productSku: string;
  productName: string;
  category?: string;
  brand?: string;
  price?: number;
  currency?: string;
}) {
  const pathname = usePathname();
  const hasAnalytics = useHasAnalyticsConsent();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!(hasAnalytics && isAnyAnalyticsProviderConfigured())) {
      return;
    }

    const key = `${pathname}:${productSku}`;
    if (lastKey.current === key) {
      return;
    }
    lastKey.current = key;

    trackViewItem({
      sku: productSku,
      name: productName,
      category,
      brand,
      price,
      currency,
    });
    trackPageViewEvent(buildSafePageUrl(pathname), productName);
  }, [
    hasAnalytics,
    pathname,
    productSku,
    productName,
    category,
    brand,
    price,
    currency,
  ]);

  return null;
}
