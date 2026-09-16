"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import CartIssuesNotice from "@/components/Cart/CartIssuesNotice";
import PaymentMethodIcons from "@/components/Common/PaymentMethodIcons";
import GatedAmount from "@/components/Product/GatedAmount";
import { usePricePersona } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import type { CmsPaymentMethod } from "@/lib/cms/types";
import { fromMedusaAmount } from "@/lib/medusa/money";
import EmptyCart from "./EmptyCart";
import SingleItem from "./SingleItem";

const CartSidebarModal = ({
  hideCart = false,
  paymentMethods = [],
}: {
  hideCart?: boolean;
  paymentMethods?: CmsPaymentMethod[];
}) => {
  const { isCartModalOpen, closeCartModal } = useCartModalContext();
  const { cart, issues, checkoutBlocked } = useCart();
  const persona = usePricePersona();
  const storeCurrency = useStoreCurrency();
  const cartItems = cart?.items ?? [];
  const currency = cart?.currency_code ?? storeCurrency;
  const subtotal = fromMedusaAmount(cart?.subtotal, currency);

  useBodyScrollLock(isCartModalOpen);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest(".modal-content")) {
        closeCartModal();
      }
    }

    if (isCartModalOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCartModalOpen, closeCartModal]);

  return (
    <div
      className={`fixed inset-0 z-99999 w-full overflow-hidden bg-surface-inverse/70 duration-300 ease-linear ${
        isCartModalOpen ? "visible opacity-100" : "invisible opacity-0"
      }`}
    >
      <div className="flex h-full justify-end">
        <div className="modal-content relative flex h-dvh w-full max-w-[500px] flex-col bg-white px-4 shadow-1 sm:px-7.5 lg:px-11">
          <div className="mb-7.5 flex shrink-0 items-center justify-between border-gray-3 border-b bg-white pt-4 pb-7 sm:pt-7.5 lg:pt-11">
            <h2 className="font-semibold text-content-primary text-lg sm:text-2xl">
              {persona === "quote" ? "Quotation" : "Cart"}
            </h2>
            <button
              aria-label="Close"
              className="text-content-muted hover:text-content-primary"
              onClick={() => closeCartModal()}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            {issues.length ? (
              <div className="mb-5">
                <CartIssuesNotice issues={issues} />
              </div>
            ) : null}
            <div className="flex flex-col gap-6">
              {cartItems.length > 0 ? (
                cartItems.map((item) => (
                  <SingleItem item={item} key={item.id} onNavigate={closeCartModal} />
                ))
              ) : (
                <EmptyCart />
              )}
            </div>
          </div>

          <div className="shrink-0 border-gray-3 border-t bg-white pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between gap-4 sm:mb-6">
              <p className="font-semibold text-content-primary text-xl">Subtotal:</p>
              <p className="font-semibold text-content-primary text-xl">
                <GatedAmount
                  amount={subtotal}
                  className="font-semibold text-content-primary text-xl"
                  currency={currency}
                />
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div
                className={
                  hideCart ? "w-full" : "flex w-full items-center gap-4 sm:w-auto"
                }
              >
                {hideCart ? null : (
                  <Link
                    className="flex w-full flex-1 justify-center rounded-md bg-action-primary-background px-6 py-[13px] font-semibold text-white hover:bg-action-primary-hover sm:w-auto"
                    href="/cart"
                    onClick={() => closeCartModal()}
                  >
                    View {persona === "quote" ? "quotation" : "cart"}
                  </Link>
                )}
                {checkoutBlocked ? (
                  <p
                    className={`flex w-full justify-center rounded-md bg-gray-1 px-6 py-[13px] text-center font-semibold text-content-primary text-sm ${
                      hideCart ? "" : "sm:w-auto"
                    }`}
                  >
                    Checkout unavailable due to out-of-stock items
                  </p>
                ) : (
                  <Link
                    className={`flex w-full justify-center rounded-md bg-surface-inverse px-6 py-[13px] font-semibold text-white ${
                      hideCart ? "" : "sm:w-auto"
                    }`}
                    href="/checkout"
                    onClick={() => closeCartModal()}
                  >
                    {persona === "quote" ? "Request a Quote" : "Checkout"}
                  </Link>
                )}
              </div>
            </div>
            {paymentMethods.length ? (
              <div className="mt-4 flex justify-center">
                <PaymentMethodIcons paymentMethods={paymentMethods} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartSidebarModal;
