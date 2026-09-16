"use client";

import { createContext, type ReactNode, useContext } from "react";
import config, { type PriceGateMode } from "@/config";

type AuthContextValue = {
  isLoggedIn: boolean;
};

const AuthContext = createContext<AuthContextValue>({ isLoggedIn: false });

export function AuthProvider({
  children,
  isLoggedIn,
}: {
  children: ReactNode;
  isLoggedIn: boolean;
}) {
  return (
    <AuthContext.Provider value={{ isLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useIsLoggedIn() {
  return useContext(AuthContext).isLoggedIn;
}

/**
 * The commercial persona a shopper sees. Logged-in customers always get the
 * paying "public" persona. Guests get the persona chosen by `PRICE_GATE_MODE`:
 *   - `off`   → "public" (prices visible, normal checkout)
 *   - `login` → "login"  (guests see "Login to see price", checkout gated)
 *   - `quote` → "quote"  (guests get the quotation bag + request quote)
 *
 * "public" means the full price/checkout experience.
 */
export type PricePersona = "public" | "login" | "quote";

export function usePricePersona(): PricePersona {
  const isLoggedIn = useIsLoggedIn();
  const mode: PriceGateMode = config.priceGateMode;

  // Logged-in customers always see prices, regardless of mode.
  if (isLoggedIn) {
    return "public";
  }

  if (mode === "login") {
    return "login";
  }
  if (mode === "quote") {
    return "quote";
  }
  // "off" — prices public to guests too.
  return "public";
}

/** False for guests when any gating mode is active (login or quote). */
export function useCanSeePrices() {
  return usePricePersona() === "public";
}