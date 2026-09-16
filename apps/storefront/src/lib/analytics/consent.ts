import type { ConsentChoices, StoredConsent } from "./types";
import { CONSENT_VERSION } from "./types";

export function defaultConsentChoices(): ConsentChoices {
  return {
    necessary: true,
    analytics: false,
    preferences: false,
    externalMedia: false,
  };
}

export function createStoredConsent(
  choices: Partial<ConsentChoices>,
  updatedAt = new Date().toISOString()
): StoredConsent {
  return {
    version: CONSENT_VERSION,
    updatedAt,
    choices: {
      necessary: true,
      analytics: Boolean(choices.analytics),
      preferences: Boolean(choices.preferences),
      externalMedia: Boolean(choices.externalMedia),
    },
  };
}

export function parseStoredConsent(raw: string | null | undefined): StoredConsent | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.version !== "number" ||
      parsed.version !== CONSENT_VERSION ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.choices !== "object" ||
      parsed.choices === null
    ) {
      return null;
    }

    return createStoredConsent(parsed.choices, parsed.updatedAt);
  } catch {
    return null;
  }
}

export function isGlobalPrivacyControlEnabled(
  nav: { globalPrivacyControl?: boolean } | null | undefined =
    typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & { globalPrivacyControl?: boolean })
): boolean {
  return Boolean(nav?.globalPrivacyControl);
}

/** GPC is treated as denial of non-necessary purposes. */
export function applyGpcDenial(_choices?: ConsentChoices): ConsentChoices {
  return {
    necessary: true,
    analytics: false,
    preferences: false,
    externalMedia: false,
  };
}

export function resolveEffectiveChoices(
  stored: StoredConsent | null,
  gpcEnabled: boolean
): ConsentChoices {
  if (gpcEnabled) {
    return applyGpcDenial(defaultConsentChoices());
  }
  return stored?.choices ?? defaultConsentChoices();
}

export function hasDecidedConsent(stored: StoredConsent | null): boolean {
  return stored !== null;
}
