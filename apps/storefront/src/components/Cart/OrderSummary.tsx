"use client";

import type { HttpTypes } from "@medusajs/types";
import Link from "next/link";
import GatedAmount from "@/components/Product/GatedAmount";
import { usePricePersona } from "@/context/AuthContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import type { CmsPaymentMethod } from "@/lib/cms/types";
import type { CartIssue } from "@/lib/medusa/cart-issues";
import { fromMedusaAmount } from "@/lib/medusa/money";
import { formatCartLineItemOptions } from "@/lib/medusa/product-options";
import PaymentMethodIcons from "../Common/PaymentMethodIcons";
import CartIssuesNotice from "./CartIssuesNotice";

const OrderSummary = ({
  cart,
  issues = [],
  checkoutBlocked = false,
  paymentMethods = [],
}: {
  cart: HttpTypes.StoreCart | null;
  issues?: CartIssue[];
  checkoutBlocked?: boolean;
  paymentMethods?: CmsPaymentMethod[];
}) => {
  const storeCurrency = useStoreCurrency();
  const persona = usePricePersona();
  const currency = cart?.currency_code ?? storeCurrency;
  const subtotal = fromMedusaAmount(cart?.subtotal, currency);
  const shipping = fromMedusaAmount(cart?.shipping_total, currency);
  const total = fromMedusaAmount(cart?.total, currency);

  return (
    <div className="ml-auto w-full lg:max-w-[455px]">
      <div className="rounded-panel bg-white shadow-1">
        <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
          <h3 className="font-semibold text-content-primary text-xl">Order summary</h3>
        </div>

        <div className="px-4 pt-2.5 pb-8.5 sm:px-8.5">
          {cart?.items?.map((item) => (
            <div
              className="flex items-center justify-between border-gray-3 border-b py-5"
              key={item.id}
            >
              <div>
                <p className="text-content-primary">
                  {item.title} x {item.quantity}
                </p>
                {(() => {
                  const attributes = formatCartLineItemOptions(item);
                  return attributes ? (
                    <p className="mt-1 text-content-muted text-custom-sm">{attributes}</p>
                  ) : null;
                })()}
              </div>
              <p className="text-right text-content-primary">
                <GatedAmount
                  amount={
                    fromMedusaAmount(item.unit_price, currency) * (item.quantity ?? 1)
                  }
                  className="text-right text-content-primary"
                  currency={currency}
                />
              </p>
            </div>
          ))}

          <div className="flex items-center justify-between border-gray-3 border-b py-3">
            <p className="text-content-primary">Subtotal</p>
            <GatedAmount amount={subtotal} currency={currency} />
          </div>

          <div className="flex items-center justify-between border-gray-3 border-b py-3">
            <p className="text-content-primary">Shipping</p>
            <GatedAmount amount={shipping} currency={currency} />
          </div>

          <div className="flex items-center justify-between pt-5">
            <p className="font-semibold text-content-primary text-lg">Total</p>
            <GatedAmount
              amount={total}
              className="font-semibold text-content-primary text-lg"
              currency={currency}
            />
          </div>

          {issues.length ? (
            <div className="mt-5">
              <CartIssuesNotice issues={issues} />
            </div>
          ) : null}

          {checkoutBlocked ? (
            <p className="mt-5 rounded-md border border-yellow-light-2 bg-yellow-light-4 px-4 py-3 text-content-primary text-sm">
              Checkout is unavailable while your cart contains out-of-stock items.
            </p>
          ) : (
            <Link
              className="mt-7.5 flex w-full justify-center rounded-md bg-action-primary-background px-6 py-3 font-semibold text-white hover:bg-action-primary-hover"
              href="/checkout"
            >
              {persona === "quote" ? "Request a quote" : "Proceed to checkout"}
            </Link>
          )}
          {paymentMethods.length ? (
            <div className="mt-4 flex justify-center">
              <PaymentMethodIcons paymentMethods={paymentMethods} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
