"use client";
import Image from "next/image";
import Link from "next/link";
import { Autoplay, EffectFade, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css/pagination";
import "swiper/css/navigation";
import "swiper/css";
import type { CmsHeroSlide } from "@/lib/cms/types";

const Chevron = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    className={`fill-current ${direction === "left" ? "rotate-90" : "-rotate-90"}`}
    fill="none"
    height="20"
    viewBox="0 0 16 16"
    width="20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      clipRule="evenodd"
      d="M2.95363 5.67461C3.13334 5.46495 3.44899 5.44067 3.65866 5.62038L7.99993 9.34147L12.3412 5.62038C12.5509 5.46495 12.8665 5.44067 13.0462 5.67461C13.2259 5.88428 13.2017 6.19993 12.992 6.37964L8.32532 10.3796C8.13808 10.5401 7.86178 10.5401 7.67453 10.3796L3.00787 6.37964C2.7982 6.19993 2.77392 5.88428 2.95363 5.67461Z"
      fill=""
      fillRule="evenodd"
    />
  </svg>
);

const FullbleedSlides = ({ slides }: { slides: CmsHeroSlide[] }) => {
  return (
    <Swiper
      autoplay={{ delay: 6500, disableOnInteraction: false, pauseOnMouseEnter: true }}
      className="hero-carousel-full"
      effect="fade"
      loop
      modules={[Autoplay, EffectFade, Navigation, Pagination]}
      navigation={{ nextEl: ".hero-full-next", prevEl: ".hero-full-prev" }}
      pagination={{ clickable: true }}
    >
      {slides.map((slide, index) => (
        <SwiperSlide key={slide.id}>
          <div className="relative h-[62vh] max-h-[760px] min-h-[480px] w-full lg:h-[72vh]">
            {slide.imageUrl ? (
              <Image
                alt={slide.title}
                className="object-cover"
                fill
                priority={index === 0}
                sizes="100vw"
                src={slide.imageUrl}
              />
            ) : null}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 pb-16">
              <div className="container">
                {slide.eyebrow ? (
                  <p className="mb-3 font-bold text-custom-xs text-white/85 uppercase tracking-[0.06em]">
                    {slide.eyebrow}
                  </p>
                ) : null}
                <h2 className="mb-4 max-w-[16ch] font-light text-4xl text-white leading-[1.1] tracking-[-0.015em] sm:text-5xl xl:text-[68px] xl:leading-[1.08]">
                  <Link className="text-white" href={slide.ctaUrl}>
                    {slide.title}
                  </Link>
                </h2>
                {slide.body ? (
                  <p className="mb-8 max-w-[52ch] text-white/85">{slide.body}</p>
                ) : null}
                {slide.ctaLabel && slide.ctaUrl ? (
                  <Link
                    className="inline-flex rounded-control border border-white/85 px-9 py-[15px] font-button text-custom-xs text-white uppercase tracking-[0.08em] transition duration-200 ease-out hover:bg-white hover:text-surface-inverse"
                    href={slide.ctaUrl}
                  >
                    {slide.ctaLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </SwiperSlide>
      ))}
      <button aria-label="Previous slide" className="hero-full-prev" type="button">
        <Chevron direction="left" />
      </button>
      <button aria-label="Next slide" className="hero-full-next" type="button">
        <Chevron direction="right" />
      </button>
    </Swiper>
  );
};

const HeroCarousel = ({
  slides,
  variant = "split",
}: {
  slides: CmsHeroSlide[];
  variant?: "split" | "fullbleed";
}) => {
  if (variant === "fullbleed") {
    return <FullbleedSlides slides={slides} />;
  }

  return (
    <Swiper
      autoplay={{ delay: 2500, disableOnInteraction: false, pauseOnMouseEnter: true }}
      centeredSlides
      className="hero-carousel"
      modules={[Autoplay, Pagination]}
      pagination={{ clickable: true }}
      spaceBetween={30}
    >
      {slides.map((slide) => (
        <SwiperSlide key={slide.id}>
          <div className="flex flex-col-reverse items-center pt-6 sm:flex-row sm:pt-0">
            <div className="max-w-[394px] py-10 pl-4 sm:py-15 sm:pl-7.5 lg:py-24.5 lg:pl-12.5">
              {slide.discountValue ? (
                <div className="mb-7.5 sm:mb-10">
                  <span className="block font-medium text-caps text-content-brand text-heading-4 sm:text-heading-2">
                    {slide.discountValue}
                  </span>
                </div>
              ) : null}
              <h2 className="mb-3 font-normal text-white text-xl sm:text-3xl">
                <Link className="text-white hover:text-white/80" href={slide.ctaUrl}>
                  {slide.title}
                </Link>
              </h2>
              <p className="text-white/80">{slide.body}</p>
              <Link
                className="mt-10 inline-flex rounded-control bg-action-primary-background px-8 py-3 font-button text-caps text-white hover:bg-action-primary-hover"
                href={slide.ctaUrl}
              >
                {slide.ctaLabel}
              </Link>
            </div>
            {slide.imageUrl && (
              <div>
                <Image alt={slide.title} height={358} src={slide.imageUrl} width={351} />
              </div>
            )}
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
};

export default HeroCarousel;
