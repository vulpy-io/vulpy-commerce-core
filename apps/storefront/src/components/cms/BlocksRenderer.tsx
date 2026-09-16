import Image from "next/image";
import Link from "next/link";
import Newsletter from "@/components/Common/Newsletter";
import CmsSection from "@/components/cms/CmsSection";
import ContactFormBlock from "@/components/cms/ContactFormBlock";
import ContactPageLayout from "@/components/cms/ContactPageLayout";
import { cmsSectionProps } from "@/components/cms/cms-section";
import MediaWithTextBlock from "@/components/cms/MediaWithTextBlock";
import { RichText } from "@/components/cms/RichText";
import BestSeller from "@/components/Home/BestSeller";
import Categories from "@/components/Home/Categories";
import CounDown from "@/components/Home/Countdown";
import Hero from "@/components/Home/Hero";
import NewArrival from "@/components/Home/NewArrivals";
import PromoBanner from "@/components/Home/PromoBanner";
import Testimonials from "@/components/Home/Testimonials";
import { isCountdownDeadlineFuture } from "@/lib/cms/countdown";
import {
  dropFirstParagraph,
  isHomeEditorialBlock,
  splitEditorialContent,
} from "@/lib/cms/editorial";
import type { CmsBlock } from "@/lib/cms/types";
import type { Category } from "@/types/category";
import type { Product } from "@/types/product";

const CtaBlock = ({
  title,
  body,
  links,
  theme,
  cmsIndex,
  cmsContext,
}: {
  title: string;
  body: string;
  links: { label: string; url: string }[];
  theme: "blue" | "teal" | "dark";
  cmsIndex: number;
  cmsContext?: string;
}) => {
  const themeClass =
    theme === "teal" ? "bg-surface-muted" : theme === "dark" ? "bg-surface-inverse" : "bg-action-primary-background";

  if (theme === "dark") {
    return (
      <section
        className="border-border-subtle border-y bg-surface-inverse py-8"
        {...cmsSectionProps({ type: "cta", index: cmsIndex, context: cmsContext })}
      >
        <div className="container text-center">
          <h2 className="font-normal text-[11px] text-caps text-white/85 tracking-[0.26em]">
            {title}
          </h2>
          {body ? (
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/85">{body}</p>
          ) : null}
          {links.length > 0 ? (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {links.map((link) => (
                <Link
                  className="rounded bg-white/20 px-4 py-2 text-sm transition hover:bg-white/30"
                  href={link.url}
                  key={`${link.url}-${link.label}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      className="container py-12 xl:py-24"
      {...cmsSectionProps({ type: "cta", index: cmsIndex, context: cmsContext })}
    >
      <div className={`rounded-panel px-6 py-10 text-white ${themeClass}`}>
        <h2 className="h4 mb-2 text-caps text-white">{title}</h2>
        {body ? <p className="mb-5 opacity-95">{body}</p> : null}
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <Link
              className="rounded bg-white/20 px-4 py-2 text-sm transition hover:bg-white/30"
              href={link.url}
              key={`${link.url}-${link.label}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default function BlocksRenderer({
  blocks,
  products = [],
  newArrivalProducts = [],
  bestsellerProducts = [],
  categories = [],
  regionId,
  context,
}: {
  blocks: CmsBlock[];
  products?: Product[];
  newArrivalProducts?: Product[];
  bestsellerProducts?: Product[];
  categories?: Category[];
  regionId?: string;
  context?: string;
}) {
  const contactInfoIndex = blocks.findIndex((block) => block.blockType === "contactInfo");
  const contactFormIndex = blocks.findIndex((block) => block.blockType === "contactForm");
  const useContactLayout = contactInfoIndex >= 0 && contactFormIndex >= 0;
  const contactLayoutIndex = useContactLayout
    ? Math.min(contactInfoIndex, contactFormIndex)
    : -1;

  return (
    <div {...cmsSectionProps({ type: "blocks", context })}>
      {blocks.map((block, index) => {
        if (useContactLayout && (index === contactInfoIndex || index === contactFormIndex)) {
          if (index !== contactLayoutIndex) {
            return null;
          }

          const contactInfo = blocks[contactInfoIndex];
          const contactForm = blocks[contactFormIndex];
          if (
            contactInfo.blockType !== "contactInfo" ||
            contactForm.blockType !== "contactForm"
          ) {
            return null;
          }

          return (
            <CmsSection context={context} index={index} key="contact-layout" type="contactLayout">
              <ContactPageLayout
                contactAddress={contactInfo.contactAddress}
                contactEmail={contactInfo.contactEmail}
                contactName={contactInfo.contactName}
                contactPhone={contactInfo.contactPhone}
                formSubtitle={contactForm.subtitle}
                formTitle={contactForm.title}
              />
            </CmsSection>
          );
        }

        const key = `${block.blockType}-${index}`;
        const blockProps = cmsSectionProps({
          type: block.blockType,
          index,
          context,
        });

        switch (block.blockType) {
          case "banner":
            return block.imageUrl ? (
              <section
                className={`relative w-full overflow-hidden ${
                  index === 0 ? "mt-[72px] lg:mt-[124px]" : ""
                }`}
                key={key}
                {...blockProps}
              >
                <Image
                  alt={block.title || "Banner"}
                  className="object-cover"
                  fill
                  priority
                  sizes="100vw"
                  src={block.imageUrl}
                />
                <div aria-hidden="true" className="absolute inset-0 z-[1] bg-black/40" />
                <div className="relative z-10 flex min-h-[480px] w-full flex-col items-start justify-center px-6 py-20 text-left sm:min-h-[560px] sm:px-12 lg:px-20 xl:px-28">
                  {block.eyebrow ? (
                    <p className="mb-3 font-medium text-sm text-white/80 uppercase tracking-[0.25em]">
                      {block.eyebrow}
                    </p>
                  ) : null}
                  <h2 className="mb-4 font-light text-3xl text-caps text-white sm:text-5xl">{block.title}</h2>
                  {block.body ? (
                    <p className="mb-8 max-w-xl text-base text-white/90 sm:text-lg">{block.body}</p>
                  ) : null}
                  {block.ctaLabel && block.ctaUrl ? (
                    <Link
                      className="inline-flex items-center justify-center rounded-control bg-white px-8 py-3 font-button text-content-primary text-sm transition hover:bg-white/90"
                      href={block.ctaUrl}
                    >
                      {block.ctaLabel}
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : null;
          case "hero":
            return (
              <CmsSection context={context} index={index} key={key} type="hero">
                <Hero badges={block.badges} promos={block.promos} slides={block.slides} />
              </CmsSection>
            );
          case "categoryGrid":
            return categories.length > 0 ? (
              <CmsSection context={context} index={index} key={key} type="categoryGrid">
                <Categories
                  categories={categories.slice(0, block.limit)}
                  eyebrow={block.eyebrow}
                  title={block.title}
                />
              </CmsSection>
            ) : null;
          case "productGrid":
            if (!regionId) {
              return null;
            }
            if (block.variant === "best-sellers") {
              if (bestsellerProducts.length === 0) {
                return null;
              }
              return (
                <CmsSection context={context} index={index} key={key} type="productGrid">
                  <BestSeller
                    products={bestsellerProducts.slice(0, block.limit)}
                    regionId={regionId}
                    subtitle={block.subtitle}
                    title={block.title}
                  />
                </CmsSection>
              );
            }
            if (block.variant === "related") {
              if (products.length === 0) {
                return null;
              }
              return (
                <CmsSection context={context} index={index} key={key} type="productGrid">
                  <BestSeller
                    products={products.slice(0, block.limit)}
                    regionId={regionId}
                    subtitle={block.subtitle || "You may also like"}
                    title={block.title}
                  />
                </CmsSection>
              );
            }
            if (newArrivalProducts.length === 0) {
              return null;
            }
            return (
              <CmsSection context={context} index={index} key={key} type="productGrid">
                <NewArrival
                  ctaLabel={block.ctaLabel}
                  ctaUrl={block.ctaUrl}
                  eyebrow={block.eyebrow}
                  products={newArrivalProducts.slice(0, block.limit)}
                  regionId={regionId}
                  title={block.title}
                />
              </CmsSection>
            );
          case "promoBanners":
            return (
              <CmsSection context={context} index={index} key={key} type="promoBanners">
                <PromoBanner banners={block.banners} />
              </CmsSection>
            );
          case "countdownPromo":
            if (!isCountdownDeadlineFuture(block.deadline)) {
              return null;
            }
            return (
              <CmsSection context={context} index={index} key={key} type="countdownPromo">
                <CounDown promo={block} />
              </CmsSection>
            );
          case "testimonials":
            return (
              <CmsSection context={context} index={index} key={key} type="testimonials">
                <Testimonials
                  eyebrow={block.eyebrow}
                  testimonials={block.items}
                  title={block.title}
                />
              </CmsSection>
            );
          case "newsletter":
            return (
              <CmsSection context={context} index={index} key={key} type="newsletter">
                <Newsletter newsletter={block} />
              </CmsSection>
            );
          case "richText":
            if (isHomeEditorialBlock(context, index)) {
              const { heading, body } = splitEditorialContent(block.content);
              return (
                <section
                  className="bg-surface py-16 xl:py-24"
                  key={key}
                  {...blockProps}
                >
                  <div className="container flex flex-col items-center px-6 text-center">
                    {heading ? (
                      <h2 className="h2">
                        {heading}
                      </h2>
                    ) : null}
                    {body.length > 0 ? (
                      <div className="mt-6 max-w-[54ch] text-base text-content-primary leading-relaxed">
                        <RichText data={dropFirstParagraph(block.content)} />
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            }
            return (
              <section className="container py-10" key={key} {...blockProps}>
                <RichText data={block.content} />
              </section>
            );
          case "contactInfo":
            return (
              <section className="container py-10" key={key} {...blockProps}>
                <div className="rounded-panel bg-surface-subtle p-6">
                  <h3 className="h4 mb-4">Contact information</h3>
                  <div className="space-y-1 text-content-muted">
                    {block.contactName ? <p>Name: {block.contactName}</p> : null}
                    {block.contactPhone ? <p>Phone: {block.contactPhone}</p> : null}
                    {block.contactEmail ? <p>Email: {block.contactEmail}</p> : null}
                    {block.contactAddress ? <p>Address: {block.contactAddress}</p> : null}
                  </div>
                </div>
              </section>
            );
          case "contactForm":
            return (
              <CmsSection context={context} index={index} key={key} type="contactForm">
                <ContactFormBlock subtitle={block.subtitle} title={block.title} />
              </CmsSection>
            );
          case "cta":
            return (
              <CtaBlock
                body={block.body}
                cmsContext={context}
                cmsIndex={index}
                key={key}
                links={block.links}
                theme={block.theme}
                title={block.title}
              />
            );
          case "faq":
            return (
              <section className="container py-12 xl:py-16" key={key} {...blockProps}>
                {block.title ? (
                  <h2 className="h2 mb-6">{block.title}</h2>
                ) : null}
                <div className="divide-y divide-border-subtle">
                  {block.items.map((item, faqIndex) => (
                    <details
                      className="group py-4"
                      key={`${item.question}-${faqIndex}`}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-content-primary">
                        {item.question}
                        <span aria-hidden className="shrink-0 text-content-muted transition-transform duration-200 group-open:rotate-180">
                          ↓
                        </span>
                      </summary>
                      <p className="mt-3 text-content-muted leading-relaxed">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          case "media":
            return block.imageUrl ? (
              <section className="container py-10" key={key} {...blockProps}>
                <Image
                  alt={block.caption || "Media"}
                  className="h-auto w-full rounded-panel object-cover"
                  height={900}
                  src={block.imageUrl}
                  width={1600}
                />
                {block.caption ? <p className="mt-2 text-center text-content-muted">{block.caption}</p> : null}
              </section>
            ) : null;
          case "mediaWithText":
            return (
              <section className="container py-12 xl:py-24" key={key} {...blockProps}>
                <MediaWithTextBlock block={block} />
              </section>
            );
          case "spacer":
            return <div key={key} {...blockProps} style={{ height: `${block.size}px` }} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
