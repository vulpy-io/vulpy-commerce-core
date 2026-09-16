"use client";
import Image from "next/image";
import { useCallback, useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css/navigation";
import "swiper/css";
import { useCarouselOverflow } from "@/hooks/useCarouselOverflow";
import type { CmsTestimonial } from "@/lib/cms/types";
import SingleItem from "./SingleItem";

const Testimonials = ({
  testimonials,
  eyebrow,
  title,
}: {
  testimonials: CmsTestimonial[];
  eyebrow: string;
  title: string;
}) => {
  const sliderRef = useRef(null);
  const { showArrows, ...overflowProps } = useCarouselOverflow();
  const handlePrev = useCallback(() => sliderRef.current?.swiper.slidePrev(), []);
  const handleNext = useCallback(() => sliderRef.current?.swiper.slideNext(), []);

  return (
    <section className="overflow-hidden py-16 xl:py-24">
      <div className="container w-full">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <span className="eyebrow mb-1.5 flex items-center gap-2.5">
              <Image alt="icon" height={17} src="/images/icons/icon-08.svg" width={17} />
              {eyebrow}
            </span>
            <h2 className="h4 text-caps">{title}</h2>
          </div>
          {showArrows ? (
            <div className="hidden items-center gap-3 sm:flex">
              <button className="swiper-button-prev" onClick={handlePrev} type="button">
                ‹
              </button>
              <button className="swiper-button-next" onClick={handleNext} type="button">
                ›
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="swiper testimonial-carousel common-carousel -mx-[15px] px-[15px] sm:mx-0 sm:px-0">
        <div className="container w-full p-0 sm:p-5">
          <Swiper
            breakpoints={{ 0: { slidesPerView: 1 }, 1050: { slidesPerView: 2 }, 1260: { slidesPerView: 3 } }}
            ref={sliderRef}
            slidesPerView={3}
            spaceBetween={20}
            {...overflowProps}
          >
            {testimonials.map((item) => (
              <SwiperSlide key={item.id}>
                <SingleItem testimonial={item} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
