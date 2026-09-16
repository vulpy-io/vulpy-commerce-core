"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import type { Swiper as SwiperType } from "swiper";
import { EffectFade } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css/effect-fade";
import "swiper/css/navigation";
import "swiper/css";
import { usePreviewSlider } from "@/app/context/PreviewSliderContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { PRODUCT_PLACEHOLDER_IMAGE } from "@/lib/medusa/asset-url";
import { useAppSelector } from "@/redux/store";

const PreviewSliderModal = () => {
  const { closePreviewModal, initialSlide, isModalPreviewOpen } =
    usePreviewSlider();
  const product = useAppSelector((state) => state.productDetailsReducer.value);
  const swiperRef = useRef<SwiperType | null>(null);

  const images =
    product.imgs?.previews?.filter((src): src is string => Boolean(src)) ?? [];
  const slides = images.length > 0 ? images : [PRODUCT_PLACEHOLDER_IMAGE];
  const showNavigation = slides.length > 1;
  const startIndex = Math.min(initialSlide, Math.max(slides.length - 1, 0));

  useBodyScrollLock(isModalPreviewOpen);

  const handlePrev = useCallback(() => {
    swiperRef.current?.slidePrev();
  }, []);

  const handleNext = useCallback(() => {
    swiperRef.current?.slideNext();
  }, []);

  useEffect(() => {
    if (!(isModalPreviewOpen && swiperRef.current)) {
      return;
    }

    const swiper = swiperRef.current;
    swiper.update();
    swiper.slideTo(startIndex, 0);
  }, [isModalPreviewOpen, startIndex, slides.length]);

  useEffect(() => {
    if (!isModalPreviewOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreviewModal();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        swiperRef.current?.slidePrev();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        swiperRef.current?.slideNext();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePreviewModal, isModalPreviewOpen]);

  return (
    <div
      aria-modal="true"
      className={`preview-slider inset-0 z-999999 h-dvh w-full bg-[#000000F2] ${
        isModalPreviewOpen ? "fixed" : "hidden"
      }`}
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
    >
      <button
        aria-label="Close dialog"
        className="absolute top-0 right-0 z-20 flex h-10 w-10 items-center justify-center rounded-full text-white duration-150 ease-in hover:text-meta-5 sm:top-6 sm:right-6"
        onClick={() => closePreviewModal()}
        type="button"
      >
        <svg
          className="fill-current"
          fill="none"
          height="36"
          viewBox="0 0 26 26"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            clipRule="evenodd"
            d="M14.3108 13L19.2291 8.08167C19.5866 7.72417 19.5866 7.12833 19.2291 6.77083C19.0543 6.59895 18.8189 6.50262 18.5737 6.50262C18.3285 6.50262 18.0932 6.59895 17.9183 6.77083L13 11.6892L8.08164 6.77083C7.90679 6.59895 7.67142 6.50262 7.42623 6.50262C7.18104 6.50262 6.94566 6.59895 6.77081 6.77083C6.41331 7.12833 6.41331 7.72417 6.77081 8.08167L11.6891 13L6.77081 17.9183C6.41331 18.2758 6.41331 18.8717 6.77081 19.2292C7.12831 19.5867 7.72414 19.5867 8.08164 19.2292L13 14.3108L17.9183 19.2292C18.2758 19.5867 18.8716 19.5867 19.2291 19.2292C19.5866 18.8717 19.5866 18.2758 19.2291 17.9183L14.3108 13Z"
            fill=""
            fillRule="evenodd"
          />
        </svg>
      </button>

      <div className="flex h-full w-full items-center justify-center px-4 sm:px-8">
        <div className="relative w-full max-w-[900px]">
          {showNavigation ? (
            <>
              <button
                aria-label="Previous image"
                className="absolute top-1/2 left-0 z-20 -translate-y-1/2 rotate-180 cursor-pointer p-2 sm:p-5"
                onClick={handlePrev}
                type="button"
              >
                <svg
                  className="fill-current text-white"
                  fill="none"
                  height="36"
                  viewBox="0 0 26 26"
                  width="36"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    clipRule="evenodd"
                    d="M14.5918 5.92548C14.9091 5.60817 15.4236 5.60817 15.7409 5.92548L22.2409 12.4255C22.5582 12.7428 22.5582 13.2572 22.2409 13.5745L15.7409 20.0745C15.4236 20.3918 14.9091 20.3918 14.5918 20.0745C14.2745 19.7572 14.2745 19.2428 14.5918 18.9255L19.7048 13.8125H4.33301C3.88428 13.8125 3.52051 13.4487 3.52051 13C3.52051 12.5513 3.88428 12.1875 4.33301 12.1875H19.7048L14.5918 7.07452C14.2745 6.75722 14.2745 6.24278 14.5918 5.92548Z"
                    fill="currentColor"
                    fillRule="evenodd"
                  />
                </svg>
              </button>

              <button
                aria-label="Next image"
                className="absolute top-1/2 right-0 z-20 -translate-y-1/2 cursor-pointer p-2 sm:p-5"
                onClick={handleNext}
                type="button"
              >
                <svg
                  className="fill-current text-white"
                  fill="none"
                  height="36"
                  viewBox="0 0 26 26"
                  width="36"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    clipRule="evenodd"
                    d="M14.5918 5.92548C14.9091 5.60817 15.4236 5.60817 15.7409 5.92548L22.2409 12.4255C22.5582 12.7428 22.5582 13.2572 22.2409 13.5745L15.7409 20.0745C15.4236 20.3918 14.9091 20.3918 14.5918 20.0745C14.2745 19.7572 14.2745 19.2428 14.5918 18.9255L19.7048 13.8125H4.33301C3.88428 13.8125 3.52051 13.4487 3.52051 13C3.52051 12.5513 3.88428 12.1875 4.33301 12.1875H19.7048L14.5918 7.07452C14.2745 6.75722 14.2745 6.24278 14.5918 5.92548Z"
                    fill="currentColor"
                    fillRule="evenodd"
                  />
                </svg>
              </button>
            </>
          ) : null}

          <Swiper
            className="preview-slider__swiper"
            effect="fade"
            fadeEffect={{ crossFade: true }}
            initialSlide={startIndex}
            key={`${product.id}-${slides.length}`}
            modules={[EffectFade]}
            observeParents
            observer
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
              swiper.slideTo(startIndex, 0);
            }}
            slidesPerView={1}
            speed={300}
          >
            {slides.map((src, index) => (
              <SwiperSlide key={`${src}-${index}`}>
                <div className="flex w-full items-center justify-center px-10 sm:px-14">
                  <Image
                    alt={product.title || "Product image"}
                    className="max-h-[85dvh] w-auto max-w-full object-contain"
                    height={900}
                    src={src}
                    width={900}
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
    </div>
  );
};

export default PreviewSliderModal;
