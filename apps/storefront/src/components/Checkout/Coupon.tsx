"use client";

import { useState, useTransition } from "react";
import {
  applyPromotionAction,
  removePromotionAction,
} from "@/app/actions/cart";
import { useCart } from "@/context/CartContext";

const Coupon = () => {
  const { cart, applyCartResult } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const appliedCodes: string[] =
    cart?.promotions
      ?.map((p: { code?: string }) => p.code)
      .filter((c): c is string => Boolean(c)) ?? [];

  const handleApply = () => {
    const trimmed = code.trim();
    if (!trimmed) { return; }
    setError(null);
    startTransition(async () => {
      const result = await applyPromotionAction(trimmed);
      if ("error" in result) {
        setError(result.error ?? "Failed to apply promotion");
      } else if (result.cart) {
        applyCartResult(result.cart, { mutation: "add", source: "promo" });
        setCode("");
      }
    });
  };

  const handleRemove = (promoCode: string) => {
    setError(null);
    startTransition(async () => {
      const result = await removePromotionAction(promoCode);
      if ("error" in result) {
        setError(result.error ?? "Failed to remove promotion");
      } else if (result.cart) {
        applyCartResult(result.cart, { mutation: "remove", source: "promo" });
      }
    });
  };

  return (
    <div className="mt-7.5 rounded-panel bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
        <h3 className="font-semibold text-content-primary text-xl">
          Have a coupon?
        </h3>
      </div>

      <div className="px-4 py-8 sm:px-8.5">
        <div className="flex gap-4">
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            data-testid="coupon-input"
            disabled={isPending}
            id="coupon"
            name="coupon"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder="Enter coupon code"
            type="text"
            value={code}
          />

          <button
            className="inline-flex rounded-md bg-action-primary-background px-6 py-3 font-semibold text-white duration-200 ease-out hover:bg-action-primary-hover disabled:opacity-50"
            data-testid="coupon-apply-button"
            disabled={isPending}
            onClick={handleApply}
            type="button"
          >
            {isPending ? "Applying..." : "Apply"}
          </button>
        </div>

        {error && (
          <p
            aria-label="Coupon error"
            className="mt-2 text-red-600 text-sm"
            data-testid="coupon-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {appliedCodes.length > 0 && (
          <ul
            className="mt-4 flex flex-col gap-2"
            data-testid="applied-coupons"
          >
            {appliedCodes.map((promoCode) => (
              <li
                className="flex items-center justify-between rounded-md bg-gray-1 px-4 py-2 text-sm"
                key={promoCode}
              >
                <span className="font-medium text-content-primary">
                  {promoCode}
                </span>
                <button
                  aria-label={`Remove coupon ${promoCode}`}
                  className="ml-4 text-content-muted hover:text-red-600"
                  disabled={isPending}
                  onClick={() => handleRemove(promoCode)}
                  type="button"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Coupon;
