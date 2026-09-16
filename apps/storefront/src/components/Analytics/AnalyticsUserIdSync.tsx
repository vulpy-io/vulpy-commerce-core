"use client";

import { useEffect, useRef } from "react";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { trackSetUserId } from "@/lib/analytics";

/**
 * Syncs hashed customer id to analytics providers (GA4 user_id / Matomo setUserId).
 * Never receives or emits raw Medusa customer ids.
 */
export default function AnalyticsUserIdSync({
  customerIdHash,
}: {
  customerIdHash: string | null;
}) {
  const hasAnalytics = useHasAnalyticsConsent();
  const lastSent = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!hasAnalytics) {
      lastSent.current = undefined;
      return;
    }
    const next = customerIdHash || null;
    if (lastSent.current === next) {
      return;
    }
    lastSent.current = next;
    trackSetUserId(next);
  }, [hasAnalytics, customerIdHash]);

  return null;
}
