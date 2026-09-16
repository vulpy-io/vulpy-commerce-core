import { registerProvider } from "../bus";
import { isGtmConfigured } from "../gtm";
import { isMatomoConfigured } from "../matomo";
import { createGtmProvider } from "./gtm-adapter";
import { createMatomoProvider } from "./matomo-adapter";

let bootstrapped = false;

/** Register env-configured analytics adapters once (client-only). */
export function bootstrapAnalyticsProviders(): void {
  if (bootstrapped || typeof window === "undefined") {
    return;
  }
  bootstrapped = true;
  if (isMatomoConfigured()) {
    registerProvider(createMatomoProvider());
  }
  if (isGtmConfigured()) {
    registerProvider(createGtmProvider());
  }
}

export function resetBootstrapForTests(): void {
  bootstrapped = false;
}

export function isAnyAnalyticsProviderConfigured(): boolean {
  return isMatomoConfigured() || isGtmConfigured();
}
