"use client";

import { useConsent } from "@/context/ConsentContext";

export default function CookieSettingsButton({
  className = "text-custom-sm text-content-muted underline-offset-2 hover:text-content-brand hover:underline",
}: {
  className?: string;
}) {
  const { openPreferences } = useConsent();

  return (
    <button className={className} onClick={openPreferences} type="button">
      Cookie settings
    </button>
  );
}
