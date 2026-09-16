"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CONSENT_COOKIE_NAME,
  type ConsentChoices,
  createStoredConsent,
  defaultConsentChoices,
  hasDecidedConsent,
  isGlobalPrivacyControlEnabled,
  parseStoredConsent,
  resolveEffectiveChoices,
  type StoredConsent,
} from "@/lib/analytics";

const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type ConsentContextValue = {
  ready: boolean;
  decided: boolean;
  gpcDenied: boolean;
  choices: ConsentChoices;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  saveChoices: (choices: Partial<ConsentChoices>) => void;
  withdrawAnalytics: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readConsentCookie(): StoredConsent | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!match) {
    return null;
  }
  const value = decodeURIComponent(match.slice(CONSENT_COOKIE_NAME.length + 1));
  return parseStoredConsent(value);
}

function writeConsentCookie(consent: StoredConsent): void {
  const encoded = encodeURIComponent(JSON.stringify(consent));
  // Cookie Store API is not available in all browsers; first-party consent cookie is intentional.
  // biome-ignore lint/suspicious/noDocumentCookie: required for cross-browser consent persistence
  // SameSite=None + Secure so the choice persists inside cross-site iframes (Vulpy demo shell).
  document.cookie = `${CONSENT_COOKIE_NAME}=${encoded}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=None; Secure`;
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<StoredConsent | null>(null);
  const [gpcDenied, setGpcDenied] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const gpc = isGlobalPrivacyControlEnabled();
    setGpcDenied(gpc);
    const existing = readConsentCookie();
    if (gpc) {
      const denied = createStoredConsent(defaultConsentChoices());
      writeConsentCookie(denied);
      setStored(denied);
    } else {
      setStored(existing);
    }
    setReady(true);
  }, []);

  const persist = useCallback((choices: Partial<ConsentChoices>) => {
    const next = createStoredConsent(choices);
    writeConsentCookie(next);
    setStored(next);
  }, []);

  const acceptAll = useCallback(() => {
    if (isGlobalPrivacyControlEnabled()) {
      persist(defaultConsentChoices());
      return;
    }
    persist({
      analytics: true,
      preferences: true,
      externalMedia: true,
    });
  }, [persist]);

  const rejectAll = useCallback(() => {
    persist(defaultConsentChoices());
  }, [persist]);

  const saveChoices = useCallback(
    (choices: Partial<ConsentChoices>) => {
      if (isGlobalPrivacyControlEnabled()) {
        persist(defaultConsentChoices());
        return;
      }
      persist(choices);
    },
    [persist]
  );

  const withdrawAnalytics = useCallback(() => {
    const current = stored?.choices ?? defaultConsentChoices();
    persist({
      ...current,
      analytics: false,
    });
  }, [persist, stored]);

  const choices = useMemo(
    () => resolveEffectiveChoices(stored, gpcDenied),
    [stored, gpcDenied]
  );

  const value = useMemo<ConsentContextValue>(
    () => ({
      ready,
      decided: hasDecidedConsent(stored) || gpcDenied,
      gpcDenied,
      choices,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptAll,
      rejectAll,
      saveChoices,
      withdrawAnalytics,
    }),
    [
      ready,
      stored,
      gpcDenied,
      choices,
      preferencesOpen,
      acceptAll,
      rejectAll,
      saveChoices,
      withdrawAnalytics,
    ]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error("useConsent must be used within ConsentProvider");
  }
  return context;
}

export function useCanUsePreferencesStorage() {
  const { ready, choices } = useConsent();
  return ready && choices.preferences;
}

export function useCanLoadExternalMedia() {
  const { ready, choices } = useConsent();
  return ready && choices.externalMedia;
}

export function useHasAnalyticsConsent() {
  const { ready, choices } = useConsent();
  return ready && choices.analytics;
}
