"use client";

import type { HttpTypes } from "@medusajs/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { fetchCartAction } from "@/app/actions/cart";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import type { CartMutationKind } from "@/lib/analytics";
import { submitCartSnapshot } from "@/lib/analytics";
import type { CartIssue } from "@/lib/medusa/cart-issues";
import { formatCartIssueMessages } from "@/lib/medusa/cart-issues";
import type { EnrichedCartResult } from "@/lib/medusa/cart-result";

type OptimisticLineItemInput = {
  variantId: string;
  quantity: number;
  title: string;
  thumbnail?: string | null;
  unitPrice: number;
  handle?: string;
};

type ApplyCartResultOptions = {
  notify?: boolean;
  mutation?: CartMutationKind;
  source?: string;
};

type CartContextValue = {
  cart: HttpTypes.StoreCart | null;
  issues: CartIssue[];
  checkoutBlocked: boolean;
  isLoading: boolean;
  refreshCart: () => Promise<void>;
  applyCartResult: (result: EnrichedCartResult, options?: ApplyCartResultOptions) => void;
  optimisticAddItem: (input: OptimisticLineItemInput) => () => void;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function buildOptimisticLineItem(
  input: OptimisticLineItemInput,
  cart: HttpTypes.StoreCart
): HttpTypes.StoreCartLineItem {
  const existing = cart.items?.find(
    (item) => item.variant_id === input.variantId
  );

  if (existing) {
    return {
      ...existing,
      quantity: (existing.quantity ?? 0) + input.quantity,
    };
  }

  return {
    id: `optimistic-${input.variantId}`,
    variant_id: input.variantId,
    quantity: input.quantity,
    title: input.title,
    thumbnail: input.thumbnail ?? undefined,
    unit_price: input.unitPrice,
    product: input.handle ? { handle: input.handle } : undefined,
  } as HttpTypes.StoreCartLineItem;
}

export function CartProvider({
  children,
  initialCart,
  initialIssues = [],
  initialCheckoutBlocked = false,
}: {
  children: ReactNode;
  initialCart: HttpTypes.StoreCart | null;
  initialIssues?: CartIssue[];
  initialCheckoutBlocked?: boolean;
}) {
  const [cart, setCart] = useState(initialCart);
  const [issues, setIssues] = useState(initialIssues);
  const [checkoutBlocked, setCheckoutBlocked] = useState(initialCheckoutBlocked);
  const [isLoading, setIsLoading] = useState(false);
  const cartSnapshotRef = useRef<HttpTypes.StoreCart | null>(initialCart);
  const hasAnalytics = useHasAnalyticsConsent();
  const hasAnalyticsRef = useRef(hasAnalytics);
  hasAnalyticsRef.current = hasAnalytics;

  const applyCartResult = useCallback(
    (result: EnrichedCartResult, options?: ApplyCartResultOptions) => {
      const previousCart = cartSnapshotRef.current;

      setCart(result.cart);
      cartSnapshotRef.current = result.cart;
      setIssues(result.issues);
      setCheckoutBlocked(result.checkoutBlocked);

      if (options?.notify) {
        for (const message of formatCartIssueMessages(
          result.issues.filter((issue) => issue.kind === "removed_unavailable")
        )) {
          toast(message, { icon: "⚠️" });
        }
      }

      if (hasAnalyticsRef.current && options?.mutation) {
        submitCartSnapshot(
          result.cart,
          options.mutation,
          options.source,
          previousCart
        );
      }
    },
    []
  );

  const refreshCart = useCallback(async () => {
    setIsLoading(true);
    try {
      const updated = await fetchCartAction();
      applyCartResult(updated, { notify: true, mutation: "hydrate" });
    } finally {
      setIsLoading(false);
    }
  }, [applyCartResult]);

  const optimisticAddItem = useCallback(
    (input: OptimisticLineItemInput) => {
      const snapshot = cartSnapshotRef.current;
      if (!snapshot) {
        return () => undefined;
      }

      const optimisticItem = buildOptimisticLineItem(input, snapshot);
      const nextItems = snapshot.items?.some(
        (item) => item.variant_id === input.variantId
      )
        ? snapshot.items.map((item) =>
            item.variant_id === input.variantId ? optimisticItem : item
          )
        : [...(snapshot.items ?? []), optimisticItem];

      const optimisticCart = {
        ...snapshot,
        items: nextItems,
      } as HttpTypes.StoreCart;

      setCart(optimisticCart);
      cartSnapshotRef.current = optimisticCart;

      return () => {
        setCart(snapshot);
        cartSnapshotRef.current = snapshot;
      };
    },
    []
  );

  useEffect(() => {
    setCart(initialCart);
    cartSnapshotRef.current = initialCart;
    setIssues(initialIssues);
    setCheckoutBlocked(initialCheckoutBlocked);

    for (const message of formatCartIssueMessages(
      initialIssues.filter((issue) => issue.kind === "removed_unavailable")
    )) {
      toast(message, { icon: "⚠️" });
    }
  }, [initialCart, initialIssues, initialCheckoutBlocked]);

  const itemCount =
    cart?.items?.reduce((sum, item) => sum + (item.quantity ?? 0), 0) ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        issues,
        checkoutBlocked,
        isLoading,
        refreshCart,
        applyCartResult,
        optimisticAddItem,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
