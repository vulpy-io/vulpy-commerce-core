"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import toast from "react-hot-toast";
import { clearCartAction } from "@/app/actions/cart";
import { useCart } from "@/context/CartContext";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { submitViewCart } from "@/lib/analytics";
import type { CmsPaymentMethod } from "@/lib/cms/types";
import PageLayout from "../Common/PageLayout";
import CartIssuesNotice from "./CartIssuesNotice";
import Discount from "./Discount";
import OrderSummary from "./OrderSummary";
import SingleItem from "./SingleItem";

const Cart = ({ paymentMethods = [] }: { paymentMethods?: CmsPaymentMethod[] }) => {
  const { cart, issues, checkoutBlocked, applyCartResult } = useCart();
  const [isPending, startTransition] = useTransition();
  const hasAnalytics = useHasAnalyticsConsent();
  const viewedRef = useRef(false);
  const cartItems = cart?.items ?? [];

  useEffect(() => {
    if (!(hasAnalytics && cartItems.length) || viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    submitViewCart(cart);
  }, [hasAnalytics, cartItems.length, cart]);

  const handleClearCart = () => {
    startTransition(async () => {
      const result = await clearCartAction();
      if (result) {
        applyCartResult(result, { mutation: "clear", source: "cart_page" });
      }
      toast.success("Cart cleared");
    });
  };

  return (
    <PageLayout title="Cart">
      {cartItems.length > 0 ? (
        <section className="overflow-hidden bg-gray-2 py-20">
          <div className="container w-full">
            <div className="mb-7.5 flex flex-wrap items-center justify-between gap-5">
              <h2 className="h2">Your cart</h2>
              <button
                className="rounded-md bg-gray-1 px-5 py-2.5 font-semibold text-content-primary duration-200 hover:bg-red-50 disabled:opacity-60"
                disabled={isPending}
                onClick={handleClearCart}
                type="button"
              >
                {isPending ? "Clearing..." : "Clear cart"}
              </button>
            </div>

            <div className="mb-7.5">
              <CartIssuesNotice issues={issues} />
            </div>

            <div className="rounded-panel bg-white shadow-1">
              <div className="w-full overflow-x-auto">
                <div className="min-w-[1170px]">
                  <div className="flex items-center px-7.5 py-5.5">
                    <div className="min-w-[400px]">
                      <p className="text-content-primary">Product</p>
                    </div>
                    <div className="min-w-[180px]">
                      <p className="text-content-primary">Price</p>
                    </div>
                    <div className="min-w-[275px]">
                      <p className="text-content-primary">Quantity</p>
                    </div>
                    <div className="min-w-[200px]">
                      <p className="text-content-primary">Subtotal</p>
                    </div>
                    <div className="min-w-[50px]">
                      <p className="text-right text-content-primary">Action</p>
                    </div>
                  </div>

                  {cartItems.map((item) => (
                    <SingleItem item={item} key={item.id} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-9 flex flex-col gap-7.5 lg:flex-row xl:gap-11">
              <Discount />
              <OrderSummary
                cart={cart}
                checkoutBlocked={checkoutBlocked}
                issues={issues}
                paymentMethods={paymentMethods}
              />
            </div>
          </div>
        </section>
      ) : (
        <div className="mt-8 py-20 text-center">
          <p className="pb-6">Your cart is empty!</p>
          <Link
            className="mx-auto flex w-96 justify-center rounded-md bg-surface-inverse px-6 py-[13px] font-semibold text-white duration-200 ease-out hover:bg-surface-inverse/95"
            href="/shop"
          >
            Continue shopping
          </Link>
        </div>
      )}
    </PageLayout>
  );
};

export default Cart;
