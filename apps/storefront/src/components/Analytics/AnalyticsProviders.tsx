"use client";

import { useEffect } from "react";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import {
  bootstrapAnalyticsProviders,
  ensureGtmConsentDefaults,
  getGtmConfig,
  getGtmNoscriptSrc,
  isAnyAnalyticsProviderConfigured,
  isGtmConfigured,
  setAnalyticsConsentGranted,
} from "@/lib/analytics";

/**
 * Registers configured analytics adapters and syncs consent.
 * Pushes Google Consent Mode v2 defaults (denied) when GTM is configured;
 * loads Matomo/GTM scripts only after analytics opt-in.
 */
export default function AnalyticsProviders({ children }: { children: React.ReactNode }) {
  const hasAnalytics = useHasAnalyticsConsent();
  const gtmId = getGtmConfig()?.containerId ?? "";

  useEffect(() => {
    bootstrapAnalyticsProviders();
    if (isGtmConfigured()) {
      ensureGtmConsentDefaults();
    }
  }, []);

  useEffect(() => {
    if (!isAnyAnalyticsProviderConfigured()) {
      return;
    }
    setAnalyticsConsentGranted(hasAnalytics);
  }, [hasAnalytics]);

  return (
    <>
      {children}
      {hasAnalytics && gtmId ? (
        <noscript>
          <iframe
            height="0"
            src={getGtmNoscriptSrc(gtmId)}
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
            width="0"
          />
        </noscript>
      ) : null}
    </>
  );
}
