"use client";

import type { HttpTypes } from "@medusajs/types";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import {
  getOrderContactName,
  getOrderPaymentMethodLabel,
  getOrderShippingMethodName,
  isStorePickupOrder,
} from "@/lib/medusa/order-display";
import OrderSummaryCard from "./OrderSummaryCard";
import {
  formatOrderDate,
  getOrderStatusClass,
  translateOrderStatus,
} from "./order-utils";

const OrderDetails = ({ order }: { order: HttpTypes.StoreOrder }) => {
  const storeCurrency = useStoreCurrency();
  const currency = order.currency_code ?? storeCurrency;
  const shippingAddress = order.shipping_address;
  const storePickup = isStorePickupOrder(order);

  return (
    <div className="max-h-[70dvh] w-full overflow-y-auto px-4 py-6 sm:px-7.5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-gray-3 border-b pb-4">
        <div>
          <p className="font-semibold text-content-primary text-lg">
            Order #{order.display_id}
          </p>
          <p className="text-content-muted text-custom-sm">
            {formatOrderDate(order.created_at)}
          </p>
        </div>
        <span
          className={`inline-block rounded-badge px-2.5 py-0.5 text-custom-sm capitalize ${getOrderStatusClass(order.status)}`}
        >
          {translateOrderStatus(order.status)}
        </span>
      </div>

      <OrderSummaryCard currency={currency} order={order} />

      <div className="mt-5 grid gap-4 border-gray-3 border-t pt-4 text-content-primary text-custom-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold">Delivery</p>
          <p className="text-content-muted">{getOrderShippingMethodName(order)}</p>
        </div>
        <div>
          <p className="mb-1 font-semibold">Payment</p>
          <p className="text-content-muted">{getOrderPaymentMethodLabel(order)}</p>
        </div>
      </div>

      {shippingAddress ? (
        <div className="mt-5 border-gray-3 border-t pt-4 text-content-primary text-custom-sm">
          <p className="mb-1 font-semibold">Shipping address</p>
          {storePickup ? (
            <p className="mb-2">Store pickup</p>
          ) : null}
          <p>{getOrderContactName(order)}</p>
          {shippingAddress.company ? <p className="text-content-muted">{shippingAddress.company}</p> : null}
          {storePickup ? null : (
            <>
              <p>{shippingAddress.address_1}</p>
              {shippingAddress.address_2 ? (
                <p>{shippingAddress.address_2}</p>
              ) : null}
              <p>
                {[shippingAddress.city, shippingAddress.province, shippingAddress.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </>
          )}
          {shippingAddress.phone ? <p>{shippingAddress.phone}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default OrderDetails;
