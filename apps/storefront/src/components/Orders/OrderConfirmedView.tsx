import type { HttpTypes } from "@medusajs/types";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getOrderContactName,
  getOrderContactPhone,
  getOrderPaymentMethodLabel,
  getOrderShippingMethodName,
  isStorePickupOrder,
} from "@/lib/medusa/order-display";
import OrderSummaryCard from "./OrderSummaryCard";
import { formatOrderDate } from "./order-utils";

function OrderDetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-panel bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
        <h3 className="font-semibold text-content-primary text-xl">{title}</h3>
      </div>
      <div className="space-y-1.5 p-4 text-content-primary text-custom-sm sm:px-8.5 sm:py-6">
        {children}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <p>
      <span className="font-medium text-content-muted">{label}: </span>
      <span>{value}</span>
    </p>
  );
}

function OrderShippingAddress({ order }: { order: HttpTypes.StoreOrder }) {
  const shippingAddress = order.shipping_address;
  if (!shippingAddress) {
    return <p>—</p>;
  }

  const storePickup = isStorePickupOrder(order);

  if (storePickup) {
    return (
      <div className="space-y-1">
        <p className="font-medium">Store pickup</p>
        <p>{getOrderContactName(order)}</p>
        {shippingAddress.phone ? <p>{shippingAddress.phone}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p>{getOrderContactName(order)}</p>
      {shippingAddress.company ? <p className="text-content-muted">{shippingAddress.company}</p> : null}
      <p>{shippingAddress.address_1}</p>
      {shippingAddress.address_2 ? <p>{shippingAddress.address_2}</p> : null}
      <p>
        {[shippingAddress.city, shippingAddress.province, shippingAddress.postal_code]
          .filter(Boolean)
          .join(", ")}
      </p>
      {shippingAddress.phone ? <p>{shippingAddress.phone}</p> : null}
    </div>
  );
}

export default function OrderConfirmedView({
  currency,
  heading,
  order,
  showOrdersLink = false,
  subheading,
}: {
  currency: string;
  heading: string;
  order: HttpTypes.StoreOrder;
  showOrdersLink?: boolean;
  subheading: string;
}) {
  const paymentMethod = getOrderPaymentMethodLabel(order);
  const shippingMethod = getOrderShippingMethodName(order);

  return (
    <section className="overflow-hidden bg-gray-2 py-20">
      <div className="container w-full">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-light-6">
            <svg
              aria-hidden
              className="text-green"
              fill="none"
              height="40"
              viewBox="0 0 40 40"
              width="40"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M33.3333 10L15 28.3333L6.66666 20"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
            </svg>
          </div>
          <h1 className="h1 mb-3">
            {heading}
          </h1>
          <p className="mb-1 text-content-primary">
            Order #<span className="font-semibold">{order.display_id}</span>
          </p>
          <p className="text-content-muted text-custom-sm">
            {formatOrderDate(order.created_at)}
          </p>
          {order.email ? (
            <p className="mt-3 text-content-muted text-custom-sm">
              Confirmation sent to{" "}
              <span className="font-medium text-content-primary">{order.email}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-7.5 lg:flex-row xl:gap-11">
          <div className="flex w-full flex-col gap-5 lg:max-w-[670px]">
            <OrderDetailCard title="Contact details">
              <DetailRow label="Name" value={getOrderContactName(order)} />
              <DetailRow
                label="Email"
                value={order.email ?? "—"}
              />
              <DetailRow
                label="Phone"
                value={getOrderContactPhone(order)}
              />
            </OrderDetailCard>

            <OrderDetailCard title="Delivery">
              <DetailRow label="Method" value={shippingMethod} />
              <div className="pt-2">
                <p className="mb-1.5 font-medium text-content-muted">Address</p>
                <OrderShippingAddress order={order} />
              </div>
            </OrderDetailCard>

            <OrderDetailCard title="Payment">
              <DetailRow label="Method" value={paymentMethod} />
            </OrderDetailCard>
          </div>

          <div className="w-full max-w-[455px]">
            <OrderSummaryCard
              currency={currency}
              footer={
                <div className="mt-5 rounded-md bg-gray-1 p-4 text-content-muted text-custom-sm">
                  We will email you order status updates. Need help?{" "}
                  <Link className="text-content-brand" href="/contact">
                    Contact support
                  </Link>
                  .
                </div>
              }
              order={order}
            />

            <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                className="flex w-full justify-center rounded-md bg-action-primary-background px-6 py-3 font-semibold text-white hover:bg-action-primary-hover"
                href="/shop"
              >
                {subheading}
              </Link>
              {showOrdersLink ? (
                <Link
                  className="flex w-full justify-center rounded-md border border-gray-3 bg-white px-6 py-3 font-semibold text-content-primary hover:bg-gray-1"
                  href="/orders"
                >
                  My orders
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
