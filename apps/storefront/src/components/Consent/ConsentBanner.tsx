"use client";

import { useConsent } from "@/context/ConsentContext";
import ConsentPreferences from "./ConsentPreferences";

export default function ConsentBanner() {
  const { ready, decided, gpcDenied, acceptAll, rejectAll, openPreferences } = useConsent();

  return (
    <>
      {ready && !decided && !gpcDenied ? (
        <section
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-99998 border-gray-3 border-t bg-white px-4 py-4 shadow-3 sm:px-6"
        >
          <div className="container flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-semibold text-content-primary text-sm">Cookies &amp; privacy</p>
              <p className="mt-1 text-content-muted text-custom-sm">
                We use necessary cookies for cart, sign-in, and checkout. Analytics,
                preference storage, and embedded videos run only if you allow them.{" "}
                <a className="text-content-brand hover:underline" href="/privacy-policy">
                  Privacy policy
                </a>
                {" · "}
                <a className="text-content-brand hover:underline" href="/cookie-policy">
                  Cookie policy
                </a>
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                className="rounded-md border border-gray-3 px-5 py-2.5 font-semibold text-content-primary text-custom-sm hover:bg-gray-1"
                onClick={rejectAll}
                type="button"
              >
                Reject
              </button>
              <button
                className="rounded-md border border-gray-3 px-5 py-2.5 font-semibold text-content-primary text-custom-sm hover:bg-gray-1"
                onClick={openPreferences}
                type="button"
              >
                Customize
              </button>
              <button
                className="rounded-md bg-action-primary-background px-5 py-2.5 font-semibold text-custom-sm text-white hover:bg-action-primary-hover"
                onClick={acceptAll}
                type="button"
              >
                Accept
              </button>
            </div>
          </div>
        </section>
      ) : null}
      <ConsentPreferences />
    </>
  );
}
