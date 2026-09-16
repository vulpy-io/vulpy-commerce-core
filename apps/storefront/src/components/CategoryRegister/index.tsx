"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageLayout, { type BreadcrumbItem } from "@/components/Common/PageLayout";
import ProductItem from "@/components/Common/ProductItem";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { trackCustomEvent } from "@/lib/analytics";
import type { RegisterChild } from "@/lib/medusa/register-model";
import type { Product } from "@/types/product";

type RegisterCollection = {
  child: RegisterChild;
  productCount: number;
  image: string | null;
  description: string | null;
  sampleProducts: Product[];
};

type CategoryRegisterProps = {
  breadcrumbCurrentPath: string;
  breadcrumbItems: BreadcrumbItem[];
  pageTitle: string;
  categoryName: string;
  deck: string | null;
  collections: RegisterCollection[];
  regionId: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

const fallbackDeck = (categoryName: string) =>
  `A register of the ${categoryName} collections — handcrafted in Britain, made to order.`;

const fallbackCollectionCopy = (title: string) =>
  `Handcrafted pieces from the ${title} collection — cast, finished and made to order in our London workshop.`;

const collectionPath = (handle: string) => `/categories/${handle}`;

export default function CategoryRegister({
  breadcrumbCurrentPath,
  breadcrumbItems,
  pageTitle,
  categoryName,
  deck,
  collections,
  regionId,
}: CategoryRegisterProps) {
  const hasAnalytics = useHasAnalyticsConsent();
  const [activeIndex, setActiveIndex] = useState(0);

  const totalCount = useMemo(
    () =>
      collections.reduce(
        (sum, collection) =>
          sum + (collection.productCount > 0 ? collection.productCount : collection.child.count),
        0
      ),
    [collections]
  );

  const active = collections[activeIndex] ?? collections[0];
  const captionOnImage = Boolean(active?.image);

  const fireRegisterSelect = (handle: string) => {
    if (!hasAnalytics) {
      return;
    }
    trackCustomEvent("Catalog", "register_select", handle);
  };

  const scrollToSection = (index: number) => {
    const collection = collections[index];
    if (!collection) {
      return;
    }
    document
      .getElementById(`register-${collection.child.handle}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Scrollspy: highlight the rail row + invert the section numeral as the
  // per-collection plates scroll through the middle band of the viewport.
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-register-section]")
    );
    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const index = Number(entry.target.getAttribute("data-register-index"));
          if (Number.isInteger(index)) {
            setActiveIndex(index);
          }
        }
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [collections]);

  return (
    <PageLayout
      breadcrumbCurrentPath={breadcrumbCurrentPath}
      breadcrumbItems={breadcrumbItems}
      breadcrumbVariant="compact"
      includeBreadcrumbJsonLd={false}
      pages={breadcrumbItems ? undefined : ["Catalog"]}
      title={pageTitle}
    >
      {/* ---------- Compact editorial header ---------- */}
      <section className="border-border-subtle border-b bg-white">
        <div className="container w-full pt-12 pb-10 lg:pt-[52px] lg:pb-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-bold text-[11px] text-caps text-content-secondary">
                The Collections · No. 01
              </div>
              <h1 className="mt-4 max-w-[14ch] text-balance font-light text-[clamp(40px,5vw,64px)] text-content-primary leading-[1.08] tracking-[-0.015em]">
                {pageTitle}
              </h1>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <span className="border border-border-subtle px-3 py-[7px] font-bold text-[11px] text-caps text-content-secondary">
                  {collections.length} Collection{collections.length === 1 ? "" : "s"}
                </span>
                <span className="border border-border-subtle px-3 py-[7px] font-bold text-[11px] text-caps text-content-secondary">
                  {totalCount} Design{totalCount === 1 ? "" : "s"}
                </span>
                <span className="border border-border-subtle px-3 py-[7px] font-bold text-[11px] text-caps text-content-secondary">
                  Made to Order
                </span>
              </div>
            </div>
            <p className="max-w-[44ch] pb-1.5 text-[15px] text-content-secondary leading-[1.75]">
              {deck ?? fallbackDeck(categoryName)}
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Register: sticky numbered rail + crossfading feature plate ---------- */}
      <section className="container w-full">
        <div className="grid grid-cols-1 items-start gap-8 py-14 lg:grid-cols-[340px_1fr] lg:gap-14 lg:py-16 lg:pb-[72px]">
          <aside className="border-action-primary-background border-t-2 lg:sticky lg:top-[calc(var(--header-height)+48px)]">
            <div className="py-4 pb-1.5 font-bold text-[11px] text-caps text-content-muted">
              The Register
            </div>
            {collections.map((collection, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  aria-current={isActive ? "true" : undefined}
                  className={`group flex w-full items-center gap-[18px] border-border-subtle border-b px-4 py-4 text-left transition-colors duration-150 ${
                    isActive ? "bg-action-primary-background" : "hover:bg-surface-subtle"
                  }`}
                  key={collection.child.handle}
                  onClick={() => {
                    setActiveIndex(index);
                    fireRegisterSelect(collection.child.handle);
                    scrollToSection(index);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  type="button"
                >
                  <span
                    className={`min-w-[26px] font-bold text-[13px] tracking-[0.16em] ${
                      isActive ? "text-white/55" : "text-content-muted"
                    }`}
                  >
                    {pad(index + 1)}
                  </span>
                  <span
                    className={`flex-1 text-[17px] tracking-[0.01em] ${
                      isActive ? "text-white" : "text-content-primary"
                    }`}
                  >
                    {collection.child.title}
                  </span>
                  <span
                    className={`text-[11px] text-caps ${
                      isActive ? "text-white/60" : "text-content-muted"
                    }`}
                  >
                    {collection.productCount > 0 ? collection.productCount : collection.child.count}
                  </span>
                  <span
                    className={`text-[13px] transition-all duration-200 ${
                      isActive
                        ? "text-white"
                        : "text-content-muted group-hover:translate-x-[3px] group-hover:text-content-primary"
                    }`}
                  >
                    →
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="relative aspect-[6/7] overflow-hidden bg-surface-muted">
            {collections.map((collection, index) =>
              collection.image ? (
                <Image
                  alt={collection.child.title}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                    index === activeIndex ? "opacity-100" : "opacity-0"
                  }`}
                  fill
                  key={collection.child.handle}
                  priority={index === 0}
                  sizes="(min-width: 1024px) min(60vw, 840px), 100vw"
                  src={collection.image}
                />
              ) : null
            )}
            {captionOnImage ? (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            ) : null}
            {active ? (
              <div className="absolute inset-x-0 bottom-0 p-6 lg:p-[26px]">
                <div
                  className={`absolute right-6 bottom-6 select-none font-light text-[60px] leading-none ${
                    captionOnImage ? "text-white/20" : "text-content-muted/30"
                  }`}
                >
                  {pad(activeIndex + 1)}
                </div>
                <div
                  className={`font-bold text-[11px] text-caps ${
                    captionOnImage ? "text-white/75" : "text-content-muted"
                  }`}
                >
                  No. {pad(activeIndex + 1)}
                </div>
                <div
                  className={`mt-2 font-light text-[28px] leading-[1.15] tracking-[0.01em] ${
                    captionOnImage ? "text-white" : "text-content-primary"
                  }`}
                >
                  {active.child.title}
                </div>
                <p
                  className={`mt-2 max-w-[46ch] text-[13px] leading-[1.7] ${
                    captionOnImage ? "text-white/80" : "text-content-secondary"
                  }`}
                >
                  {active.description ?? fallbackCollectionCopy(active.child.title)}
                </p>
                <Link
                  className={`mt-4 inline-block border-b pb-1 font-bold text-[12px] text-caps ${
                    captionOnImage
                      ? "border-white/50 text-white hover:border-white"
                      : "border-action-primary-background text-content-primary hover:border-content-secondary hover:text-content-secondary"
                  }`}
                  href={collectionPath(active.child.handle)}
                  onClick={() => fireRegisterSelect(active.child.handle)}
                >
                  View collection →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---------- Plates: one section per collection ---------- */}
      <section className="border-border-subtle border-t">
        {collections.map((collection, index) => {
          const isActive = index === activeIndex;
          const displayCount =
            collection.productCount > 0 ? collection.productCount : collection.child.count;
          return (
            <div
              className={`border-border-subtle border-b py-[72px] ${
                index % 2 === 1 ? "bg-surface-muted" : "bg-white"
              }`}
              data-register-index={index}
              data-register-section
              id={`register-${collection.child.handle}`}
              key={collection.child.handle}
            >
              <div className="container w-full">
                <div className="grid grid-cols-1 items-center gap-7 lg:grid-cols-[380px_1fr] lg:gap-14">
                  <div>
                    <div
                      className={`font-light text-[clamp(64px,7vw,96px)] text-transparent leading-none tracking-[-0.02em] [-webkit-text-stroke:1px_var(--color-content-muted)] ${
                        isActive
                          ? "[-webkit-text-stroke-color:var(--color-content-primary)]"
                          : ""
                      }`}
                    >
                      {pad(index + 1)}
                    </div>
                    <div className="mt-[18px] font-bold text-[11px] text-caps text-content-secondary">
                      No. {pad(index + 1)}
                    </div>
                    <h2 className="h2 mt-2.5">
                      {collection.child.title}
                    </h2>
                    <p className="mt-3.5 max-w-[40ch] text-content-secondary text-sm leading-[1.75]">
                      {collection.description ?? fallbackCollectionCopy(collection.child.title)}
                    </p>
                    <Link
                      className="mt-[22px] inline-block border-action-primary-background border-b pb-1 font-bold text-[12px] text-caps text-content-primary transition-colors duration-150 hover:border-content-secondary hover:text-content-secondary"
                      href={collectionPath(collection.child.handle)}
                      onClick={() => fireRegisterSelect(collection.child.handle)}
                    >
                      View all {displayCount} →
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
                    {collection.sampleProducts.map((product, productIndex) => (
                      <ProductItem
                        item={product}
                        key={product.id}
                        listId={`register_${collection.child.handle}`}
                        listName={collection.child.title}
                        position={productIndex + 1}
                        regionId={regionId}
                        transparentBackground
                      />
                    ))}
                    {collection.sampleProducts.length < displayCount ? (
                      <Link
                        className="col-span-2 hidden aspect-[6/7] flex-col items-center justify-center gap-2.5 border border-border-subtle bg-surface-raised p-6 text-center transition-colors duration-150 hover:border-action-primary-background hover:bg-surface-subtle lg:col-span-1 lg:flex"
                        href={collectionPath(collection.child.handle)}
                        onClick={() => fireRegisterSelect(collection.child.handle)}
                      >
                        <span className="font-light text-[40px] text-content-muted">+</span>
                        <span className="font-bold text-[12px] text-caps text-content-primary">
                          View all {displayCount}
                        </span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </PageLayout>
  );
}