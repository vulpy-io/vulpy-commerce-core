"use client";

import type { HttpTypes } from "@medusajs/types";
import { useEffect, useRef } from "react";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { isAnyAnalyticsProviderConfigured, submitPurchaseOnce } from "@/lib/analytics";

export default function PurchaseTracker({ order }: { order: HttpTypes.StoreOrder }) {
  const hasAnalytics = useHasAnalyticsConsent();
  const sentRef = useRef(false);

  useEffect(() => {
    if (!(hasAnalytics && isAnyAnalyticsProviderConfigured()) || sentRef.current) {
      return;
    }
    if (submitPurchaseOnce(order)) {
      sentRef.current = true;
    }
  }, [hasAnalytics, order]);

  return null;
}
