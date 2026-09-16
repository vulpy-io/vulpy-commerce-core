"use client";

import { createContext, type ReactNode, useContext } from "react";

type StoreRegionContextValue = {
  regionId: string;
  currencyCode: string;
};

const StoreRegionContext = createContext<StoreRegionContextValue | null>(null);

export function StoreRegionProvider({
  children,
  regionId,
  currencyCode,
}: {
  children: ReactNode;
  regionId: string;
  currencyCode: string;
}) {
  return (
    <StoreRegionContext.Provider value={{ regionId, currencyCode }}>
      {children}
    </StoreRegionContext.Provider>
  );
}

export function useStoreRegion() {
  const context = useContext(StoreRegionContext);
  if (!context) {
    throw new Error("useStoreRegion must be used within StoreRegionProvider");
  }
  return context;
}

export function useStoreCurrency() {
  return useStoreRegion().currencyCode;
}
