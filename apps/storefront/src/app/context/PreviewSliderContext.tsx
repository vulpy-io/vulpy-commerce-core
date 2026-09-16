"use client";

import { createContext, useContext, useState } from "react";

type PreviewSliderType = {
  isModalPreviewOpen: boolean;
  initialSlide: number;
  openPreviewModal: (slideIndex?: number) => void;
  closePreviewModal: () => void;
};

const PreviewSlider = createContext<PreviewSliderType | undefined>(undefined);

export const usePreviewSlider = () => {
  const context = useContext(PreviewSlider);
  if (!context) {
    throw new Error("usePreviewSlider must be used within a PreviewSliderProvider");
  }
  return context;
};

export const PreviewSliderProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isModalPreviewOpen, setIsModalOpen] = useState(false);
  const [initialSlide, setInitialSlide] = useState(0);

  const openPreviewModal = (slideIndex = 0) => {
    setInitialSlide(slideIndex);
    setIsModalOpen(true);
  };

  const closePreviewModal = () => {
    setIsModalOpen(false);
  };

  return (
    <PreviewSlider.Provider
      value={{
        isModalPreviewOpen,
        initialSlide,
        openPreviewModal,
        closePreviewModal,
      }}
    >
      {children}
    </PreviewSlider.Provider>
  );
};
