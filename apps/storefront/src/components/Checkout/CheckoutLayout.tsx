"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import FooterCopyright from "@/components/Footer/FooterCopyright";
import { usePricePersona } from "@/context/AuthContext";
import type { CmsSiteSettings } from "@/lib/cms/types";

export default function CheckoutLayout({
  children,
  siteSettings,
  title,
}: {
  children: ReactNode;
  siteSettings: CmsSiteSettings;
  title?: string;
}) {
  const persona = usePricePersona();
  const logoUrl =
    siteSettings.checkoutLogoUrl ||
    siteSettings.logoUrl ||
    "/images/logo/logo.svg";

  const heading =
    title ??
    (persona === "quote" ? "Request a Quote" : "Checkout");

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-gray-3 border-b">
        <div className="container flex flex-col items-start gap-3 py-6 sm:gap-4 sm:py-8">
          <Link className="inline-flex" href="/">
            <Image
              alt={siteSettings.siteName}
              className="h-[30px] w-auto sm:h-9"
              height={36}
              src={logoUrl}
              width={120}
            />
          </Link>
          <h1 className="h1 mt-10">{heading}</h1>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <FooterCopyright
        align="start"
        showPaymentMethods={false}
        siteSettings={siteSettings}
      />
    </div>
  );
}
