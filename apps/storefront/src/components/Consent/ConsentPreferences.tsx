"use client";

import { useEffect, useId, useState } from "react";
import { useConsent } from "@/context/ConsentContext";
import type { ConsentChoices } from "@/lib/analytics";

function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-gray-3 border-b py-4 last:border-b-0">
      <div>
        <label className="font-medium text-content-primary text-sm" htmlFor={id}>
          {label}
        </label>
        <p className="mt-1 text-content-muted text-custom-sm">{description}</p>
      </div>
      <input
        checked={checked}
        className="mt-1 h-4 w-4 accent-action-primary-background"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
    </div>
  );
}

export default function ConsentPreferences() {
  const {
    preferencesOpen,
    closePreferences,
    choices,
    gpcDenied,
    saveChoices,
    rejectAll,
    acceptAll,
  } = useConsent();
  const titleId = useId();
  const [draft, setDraft] = useState<ConsentChoices>(choices);

  useEffect(() => {
    if (preferencesOpen) {
      setDraft(choices);
    }
  }, [preferencesOpen, choices]);

  useEffect(() => {
    if (!preferencesOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreferences();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preferencesOpen, closePreferences]);

  if (!preferencesOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-99999 flex items-end justify-center bg-surface-inverse/70 px-4 py-6 sm:items-center"
      role="dialog"
    >
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-3 sm:p-7.5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-semibold text-content-primary text-xl" id={titleId}>
            Cookie settings
          </h2>
          <button
            aria-label="Close cookie settings"
            className="text-content-muted hover:text-content-primary"
            onClick={closePreferences}
            type="button"
          >
            ✕
          </button>
        </div>

        <p className="mb-2 text-content-muted text-custom-sm">
          Necessary storage keeps the shop working (cart, sign-in, checkout). Optional
          categories stay off until you choose them.{" "}
          <a className="text-content-brand hover:underline" href="/cookie-policy">
            Cookie policy
          </a>
        </p>

        {gpcDenied ? (
          <p className="mb-4 rounded-md bg-gray-1 px-3 py-2 text-content-muted text-custom-sm">
            Global Privacy Control is enabled in your browser. Optional cookies remain
            off.
          </p>
        ) : null}

        <ToggleRow
          checked
          description="Cart, authentication, checkout (including Stripe), and consent choice. Always on."
          disabled
          id="consent-necessary"
          label="Necessary"
        />
        <ToggleRow
          checked={draft.analytics}
          description="First-party Matomo analytics for page journeys, product behavior, and ecommerce funnels."
          disabled={gpcDenied}
          id="consent-analytics"
          label="Analytics"
          onChange={(analytics) => setDraft((prev) => ({ ...prev, analytics }))}
        />
        <ToggleRow
          checked={draft.preferences}
          description="Remember wishlist and recently viewed products on this device."
          disabled={gpcDenied}
          id="consent-preferences"
          label="Preferences"
          onChange={(preferences) => setDraft((prev) => ({ ...prev, preferences }))}
        />
        <ToggleRow
          checked={draft.externalMedia}
          description="Load YouTube or Vimeo embeds from CMS content."
          disabled={gpcDenied}
          id="consent-media"
          label="External media"
          onChange={(externalMedia) => setDraft((prev) => ({ ...prev, externalMedia }))}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            className="flex-1 rounded-md border border-gray-3 px-4 py-3 font-semibold text-content-primary text-custom-sm hover:bg-gray-1"
            onClick={() => {
              rejectAll();
              closePreferences();
            }}
            type="button"
          >
            Reject optional
          </button>
          <button
            className="flex-1 rounded-md border border-gray-3 px-4 py-3 font-semibold text-content-primary text-custom-sm hover:bg-gray-1"
            onClick={() => {
              saveChoices(draft);
              closePreferences();
            }}
            type="button"
          >
            Save choices
          </button>
          <button
            className="flex-1 rounded-md bg-action-primary-background px-4 py-3 font-semibold text-custom-sm text-white hover:bg-action-primary-hover"
            onClick={() => {
              acceptAll();
              closePreferences();
            }}
            type="button"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
