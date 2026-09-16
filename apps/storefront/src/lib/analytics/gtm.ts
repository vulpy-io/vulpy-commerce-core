export function getGtmConfig(): { containerId: string } | null {
  const containerId = (process.env.NEXT_PUBLIC_GTM_ID ?? "").trim();
  if (!containerId) {
    return null;
  }
  return { containerId };
}

export function isGtmConfigured(): boolean {
  return getGtmConfig() !== null;
}

function getDataLayer(): unknown[] {
  if (typeof window === "undefined") {
    return [];
  }
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

export function pushDataLayer(payload: Record<string, unknown> | unknown[]): void {
  if (!isGtmConfigured()) {
    return;
  }
  getDataLayer().push(payload);
}

export function clearEcommerceDataLayer(): void {
  pushDataLayer({ ecommerce: null });
}

const CONSENT_DENIED = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

let consentDefaultsPushed = false;

/** Google Consent Mode v2 — deny by default before GTM loads. */
export function ensureGtmConsentDefaults(): void {
  if (typeof window === "undefined" || !isGtmConfigured() || consentDefaultsPushed) {
    return;
  }
  pushDataLayer([
    "consent",
    "default",
    {
      ...CONSENT_DENIED,
      wait_for_update: 500,
    },
  ]);
  consentDefaultsPushed = true;
}

/** Update Consent Mode after cookie banner accept/withdraw. */
export function updateGtmConsent(granted: boolean): void {
  if (typeof window === "undefined" || !isGtmConfigured()) {
    return;
  }
  ensureGtmConsentDefaults();
  const value = granted ? "granted" : "denied";
  pushDataLayer([
    "consent",
    "update",
    {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value,
    },
  ]);
}

let scriptLoaded = false;

export function loadGtmScript(containerId: string): void {
  if (typeof window === "undefined" || scriptLoaded) {
    return;
  }

  if (document.querySelector(`script[data-gtm="${containerId}"]`)) {
    scriptLoaded = true;
    return;
  }

  ensureGtmConsentDefaults();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    "gtm.start": Date.now(),
    event: "gtm.js",
  });

  const script = document.createElement("script");
  script.async = true;
  script.dataset.gtm = containerId;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(script);
  scriptLoaded = true;
}

export function getGtmNoscriptSrc(containerId: string): string {
  return `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(containerId)}`;
}

export function resetGtmScriptForTests(): void {
  scriptLoaded = false;
  consentDefaultsPushed = false;
}
