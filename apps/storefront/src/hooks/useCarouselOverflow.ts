"use client";

import { useCallback, useState } from "react";
import type { Swiper as SwiperType } from "swiper";

export function useCarouselOverflow() {
  const [showArrows, setShowArrows] = useState(false);

  const updateOverflow = useCallback((swiper: SwiperType) => {
    setShowArrows(!swiper.isLocked);
  }, []);

  return {
    showArrows,
    watchOverflow: true as const,
    onSwiper: updateOverflow,
    onResize: updateOverflow,
    onBreakpoint: updateOverflow,
    onSlidesLengthChange: updateOverflow,
  };
}
