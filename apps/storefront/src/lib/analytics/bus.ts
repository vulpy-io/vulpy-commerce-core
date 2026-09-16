import type { AnalyticsEvent, AnalyticsProvider } from "./catalog";

const providers = new Map<string, AnalyticsProvider>();
let analyticsConsentGranted = false;

export function setAnalyticsConsentGranted(granted: boolean): void {
  analyticsConsentGranted = granted;
  for (const provider of Array.from(providers.values())) {
    provider.onConsentChange?.(granted);
  }
}

export function getAnalyticsConsentGranted(): boolean {
  return analyticsConsentGranted;
}

export function registerProvider(provider: AnalyticsProvider): void {
  if (!provider.isConfigured()) {
    return;
  }
  providers.set(provider.id, provider);
  provider.onConsentChange?.(analyticsConsentGranted);
}

export function unregisterProvider(id: string): void {
  providers.delete(id);
}

export function clearProvidersForTests(): void {
  providers.clear();
  analyticsConsentGranted = false;
}

export function getRegisteredProviderIds(): string[] {
  return Array.from(providers.keys());
}

/** True when at least one env-configured provider is registered (or would be). */
export function isAnalyticsConfigured(): boolean {
  if (providers.size > 0) {
    return true;
  }
  // Before registration (SSR / early client): check env directly via dynamic import avoidance —
  // callers that need pre-register checks use provider isConfigured helpers.
  return false;
}

export function hasActiveAnalytics(): boolean {
  return analyticsConsentGranted && providers.size > 0;
}

export function emit(event: AnalyticsEvent): void {
  if (!analyticsConsentGranted) {
    return;
  }
  for (const provider of Array.from(providers.values())) {
    try {
      provider.track(event);
    } catch {
      // Fail closed per provider — never break the shop.
    }
  }
}
