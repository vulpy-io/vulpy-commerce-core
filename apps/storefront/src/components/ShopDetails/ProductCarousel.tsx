"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import { Pagination } from "swiper/modules";
import { Swiper, type SwiperRef, SwiperSlide } from "swiper/react";
import "swiper/css/pagination";
import "swiper/css/navigation";
import "swiper/css";
import ProductItem from "@/components/Common/ProductItem";
import { useCarouselOverflow } from "@/hooks/useCarouselOverflow";
import type { Product } from "@/types/product";

const PRODUCT_CAROUSEL_BREAKPOINTS = {
  0: { slidesPerView: 1 },
  640: { slidesPerView: 2 },
  1024: { slidesPerView: 3 },
  1280: { slidesPerView: 4 },
};

function CarouselArrows({
  show,
  onPrev,
  onNext,
}: {
  show: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!show) {
    return null;
  }

  return (
    <div className="hidden items-center gap-3 sm:flex">
      <button aria-label="Previous" className="swiper-button-prev" onClick={onPrev} type="button">
        <HiChevronLeft aria-hidden="true" className="size-5" />
      </button>
      <button aria-label="Next" className="swiper-button-next" onClick={onNext} type="button">
        <HiChevronRight aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}

export type ProductCarouselHeaderLayout =
  | "default"
  | "eyebrow-cta"
  | "centered"
  | "editorial";

export default function ProductCarousel({
  title,
  products,
  regionId,
  eyebrow,
  subtitle,
  ctaLabel,
  ctaUrl,
  headerLayout = "default",
  showBorder = true,
  sectionClassName = "pt-17.5",
  variant = "carousel",
  note,
}: {
  title: string;
  products: Product[];
  regionId: string;
  eyebrow?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  headerLayout?: ProductCarouselHeaderLayout;
  showBorder?: boolean;
  sectionClassName?: string;
  variant?: "carousel" | "grid";
  note?: string;
}) {
  const sliderRef = useRef<SwiperRef | null>(null);
  const { showArrows, ...overflowProps } = useCarouselOverflow();

  const handlePrev = useCallback(() => {
    sliderRef.current?.swiper.slidePrev();
  }, []);

  const handleNext = useCallback(() => {
    sliderRef.current?.swiper.slideNext();
  }, []);

  if (!products.length) {
    return null;
  }

  const containerClassName = showBorder
    ? "container w-full border-border-subtle border-b pb-15"
    : "container w-full";

  if (variant === "grid") {
    return (
      <section className={`overflow-hidden ${sectionClassName}`}>
        <div className={containerClassName}>
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              {eyebrow ? (
                <span className="eyebrow mb-2 block">
                  {eyebrow}
                </span>
              ) : null}
              <h2 className="h2">
                {title}
              </h2>
            </div>
            {ctaLabel && ctaUrl ? (
              <Link
                className="border-content-primary border-b pb-1 font-normal text-caps text-content-primary text-custom-xs tracking-[0.12em] transition duration-200 ease-out hover:border-content-muted hover:text-content-muted"
                href={ctaUrl}
              >
                {ctaLabel} →
              </Link>
            ) : null}
          </div>
          {note ? <p className="mb-8 text-[13px] text-content-muted tracking-[0.03em]">{note}</p> : null}
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
            {products.map((item, index) => (
              <ProductItem
                item={item}
                key={item.id}
                listId="new-arrivals"
                listName="New arrivals"
                position={index + 1}
                regionId={regionId}
                showActions={false}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const header =
    headerLayout === "eyebrow-cta" ? (
      <div className="mb-7 flex items-center justify-between gap-4">
        <div>
          {eyebrow ? (
            <span className="mb-1.5 flex items-center gap-2.5 font-medium text-content-primary">
              {eyebrow}
            </span>
          ) : null}
          <h2 className="h4 text-caps">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CarouselArrows onNext={handleNext} onPrev={handlePrev} show={showArrows} />
          {ctaLabel && ctaUrl ? (
            <Link
              className="inline-flex rounded-control border border-border-subtle bg-surface-muted px-7 py-2.5 font-button text-content-primary text-custom-sm duration-200 ease-out hover:border-transparent hover:bg-surface-inverse hover:text-white"
              href={ctaUrl}
            >
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    ) : headerLayout === "centered" ? (
      <>
        <div className="mb-10 text-center">
          <h2 className="h4 mb-1.5 text-caps">{title}</h2>
          {subtitle ? <p className="text-content-muted">{subtitle}</p> : null}
        </div>
        {showArrows ? (
          <div className="mb-6 hidden justify-end sm:flex">
            <CarouselArrows onNext={handleNext} onPrev={handlePrev} show={showArrows} />
          </div>
        ) : null}
      </>
    ) : headerLayout === "editorial" ? (
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          {eyebrow ? (
            <span className="eyebrow mb-3 block">
              {eyebrow}
            </span>
          ) : null}
          <h2 className="h2">
            {title}
          </h2>
        </div>
        {ctaLabel && ctaUrl ? (
          <Link
            className="border-content-primary border-b pb-1 font-button text-[12px] text-content-primary uppercase tracking-[0.08em] transition duration-200 ease-out hover:border-content-muted hover:text-content-muted"
            href={ctaUrl}
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    ) : (
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="h4 text-caps">{title}</h2>
        </div>
        <CarouselArrows onNext={handleNext} onPrev={handlePrev} show={showArrows} />
      </div>
    );

  return (
    <section className={`overflow-hidden ${sectionClassName}`}>
      <div className={containerClassName}>
        <div className="swiper categories-carousel common-carousel product-carousel">
          {header}
          <Swiper
            breakpoints={PRODUCT_CAROUSEL_BREAKPOINTS}
            className="pb-10! sm:pb-0!"
            modules={[Pagination]}
            pagination={{ clickable: true }}
            ref={sliderRef}
            slidesPerView={4}
            spaceBetween={20}
            {...overflowProps}
          >
            {products.map((item, index) => (
              <SwiperSlide key={item.id}>
                <ProductItem
                  item={item}
                  listId="related"
                  listName="Related products"
                  position={index + 1}
                  regionId={regionId}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
    </section>
  );
}
