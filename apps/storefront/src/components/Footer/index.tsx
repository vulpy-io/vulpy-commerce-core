import Image from "next/image";
import Link from "next/link";
import SocialIcon from "@/components/Common/SocialIcon";
import { cmsSectionProps } from "@/components/cms/cms-section";
import type { CmsFooter, CmsSiteSettings } from "@/lib/cms/types";
import { toTelHref } from "@/lib/phone";
import { HEADER_LOGO_HEIGHT, HEADER_LOGO_WIDTH, headerLogoUrl, isSvgLogo } from "@/lib/site-logo";
import FooterCopyright from "./FooterCopyright";

const Footer = ({
  siteSettings,
  footer,
}: {
  siteSettings: CmsSiteSettings;
  footer: CmsFooter;
}) => {
  const { contactInfo } = siteSettings;
  const logoSrc = headerLogoUrl(siteSettings.logoUrl);

  return (
    <footer className="overflow-hidden" {...cmsSectionProps({ type: "footer", global: "footer" })}>
      <div className="bg-footer-background text-content-secondary">
      <div className="container">
        <div className="flex flex-wrap gap-10 pt-17.5 pb-10 lg:flex-nowrap lg:justify-between xl:gap-19 xl:pt-22.5 xl:pb-15">
          <div
            className="w-full max-w-[330px] lg:shrink-0"
            {...cmsSectionProps({ type: "contact-info", global: "site-settings" })}
          >
            <h2 className="mb-7.5 font-bold text-[11px] text-caps text-content-primary tracking-[0.18em]">
              {footer.helpTitle}
            </h2>
            <ul className="flex flex-col gap-3 text-[13px] text-content-secondary">
              {contactInfo.address ? <li>{contactInfo.address}</li> : null}
              {contactInfo.phone ? (
                <li>
                  <a className="hover:text-content-primary" href={toTelHref(contactInfo.phone)}>
                    {contactInfo.phone}
                  </a>
                </li>
              ) : null}
              {contactInfo.email ? (
                <li>
                  <a className="hover:text-content-primary" href={`mailto:${contactInfo.email}`}>
                    {contactInfo.email}
                  </a>
                </li>
              ) : null}
            </ul>
            <div className="mt-7.5">
              <h3 className="mb-4 font-bold text-[11px] text-caps text-content-primary tracking-[0.18em]">
                Follow Us
              </h3>
              <div className="flex items-center gap-3.5 text-content-secondary">
                {siteSettings.socialLinks.map((link) => (
                  <a
                    aria-label={link.platform}
                    className="flex items-center duration-200 ease-out hover:text-content-primary"
                    href={link.url}
                    key={link.platform}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <SocialIcon className="size-[19px]" platform={link.platform} />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {footer.columns.map((column) => (
            <div
              className="w-full sm:w-auto lg:flex-1"
              key={column.title}
              {...cmsSectionProps({ type: "footer-column", global: "footer" })}
            >
              <h2 className="mb-7.5 font-bold text-[11px] text-caps text-content-primary tracking-[0.18em]">
                {column.title}
              </h2>
              <ul className="flex flex-col gap-3 text-[13px] text-content-secondary">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      className="flex items-center duration-200 ease-out hover:text-content-primary"
                      href={link.url}
                      target={link.newTab ? "_blank" : undefined}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {footer.legalLinks.length > 0 ? (
            <div className="w-full sm:w-auto lg:flex-1">
              <h2 className="mb-7.5 font-bold text-[11px] text-caps text-content-primary tracking-[0.18em]">
                Legal
              </h2>
              <ul className="flex flex-col gap-3 text-[13px] text-content-secondary">
                {footer.legalLinks.map((link) => (
                  <li key={link.label}>
                    <Link className="flex items-center duration-200 ease-out hover:text-content-primary" href={link.url}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            className="flex w-full items-start sm:w-auto lg:flex-1 lg:justify-end"
            {...cmsSectionProps({ type: "footer-logo", global: "site-settings" })}
          >
            <Link className="shrink-0" href="/">
              <Image
                alt={siteSettings.siteName}
                className="h-auto w-[150px]"
                height={HEADER_LOGO_HEIGHT}
                src={logoSrc}
                unoptimized={isSvgLogo(logoSrc)}
                width={HEADER_LOGO_WIDTH}
              />
            </Link>
          </div>
        </div>
      </div>
      </div>

      <FooterCopyright
        paymentMethods={siteSettings.paymentMethods}
        siteSettings={siteSettings}
      />
    </footer>
  );
};

export default Footer;
