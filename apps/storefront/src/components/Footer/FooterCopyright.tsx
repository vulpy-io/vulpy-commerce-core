import PaymentMethodIcons from "@/components/Common/PaymentMethodIcons";
import CookieSettingsButton from "@/components/Consent/CookieSettingsButton";
import type { CmsPaymentMethod, CmsSiteSettings } from "@/lib/cms/types";

export default function FooterCopyright({
  siteSettings,
  paymentMethods = [],
  showPaymentMethods = true,
  align = "between",
}: {
  siteSettings: CmsSiteSettings;
  paymentMethods?: CmsPaymentMethod[];
  showPaymentMethods?: boolean;
  align?: "between" | "start";
}) {
  const year = new Date().getFullYear();
  const copyright = siteSettings.copyright?.trim();

  // The CMS copyright may already include the year (e.g. "© 2026 …") — never
  // prepend the current year again, or the footer shows it twice.
  const display =
    copyright && !copyright.startsWith("©") ? `© ${year} ${copyright}` : copyright;

  if (!display) {
    return (
      <div className="border-gray-3 border-t bg-surface py-5">
        <div className="container flex flex-wrap items-center justify-between gap-4">
          <CookieSettingsButton />
          {showPaymentMethods && paymentMethods.length ? (
            <PaymentMethodIcons paymentMethods={paymentMethods} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-gray-3 border-t bg-surface py-5">
      <div
        className={`container flex flex-wrap items-center gap-4 ${
          align === "start" ? "justify-start" : "justify-between"
        }`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-content-muted text-custom-sm">
            {display}. All rights reserved.
          </p>
          <CookieSettingsButton />
        </div>
        {showPaymentMethods && paymentMethods.length ? (
          <PaymentMethodIcons paymentMethods={paymentMethods} />
        ) : null}
      </div>
    </div>
  );
}
