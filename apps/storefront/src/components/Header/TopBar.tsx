"use client";
import Link from "next/link";
import { cmsSectionProps } from "@/components/cms/cms-section";
import type { CmsSiteSettings } from "@/lib/cms/types";

export interface TopBarProps {
  siteSettings: CmsSiteSettings;
}

/**
 * Row 1 of the two-bar header — the desktop-only utility strip.
 * Tagline on the left, utility links on the right, on the footer background.
 * Hidden below `lg`; the main bar (NavBar) carries the logo/icons on mobile.
 */
export const TopBar = ({ siteSettings }: TopBarProps) => {
  const tagline = siteSettings.topBarText ?? "";
  const links = siteSettings.topBarLinks ?? [];

  return (
    <div className="hidden bg-footer-background lg:block">
      <div className="container">
        <div
          className="flex items-center justify-between py-2 font-semibold text-[11px] text-content-secondary uppercase tracking-[0.08em]"
          {...cmsSectionProps({ type: "site-settings", global: "site-settings" })}
        >
          <span>{tagline}</span>
          {links.length > 0 ? (
            <span className="flex gap-6">
              {links.map((link, i) => (
                <Link
                  className="duration-200 ease-out"
                  href={link.url}
                  key={`${link.label}-${i}`}
                >
                  {link.label}
                </Link>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
