import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PurchaseTracker from "@/components/Analytics/PurchaseTracker";
import PageLayout from "@/components/Common/PageLayout";
import OrderConfirmedView from "@/components/Orders/OrderConfirmedView";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getSiteSettings, getUtilitySeo } from "@/lib/cms/queries";
import { getCurrencyCode } from "@/lib/data";
import { getCustomer } from "@/lib/medusa/customer";
import { getEnrichedOrder } from "@/lib/medusa/order";

type Props = {
  params: Promise<{ id: string }>;
};

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/order/confirmed", {
    title: "Order confirmed | Vulpy Commerce",
    description: "Thank you for your order",
  }, { noindex: true });
}

export default async function OrderConfirmedPage({ params }: Props) {
  const { id } = await params;
  const [order, settings, defaultCurrency, customer] = await Promise.all([
    getEnrichedOrder(id),
    getSiteSettings(),
    getCurrencyCode(),
    getCustomer(),
  ]);
  const copy = getUtilitySeo(settings, "/order/confirmed", {
    title: "Order confirmed | Vulpy Commerce",
    description: "Thank you for your order",
    heading: "Thank you for your order!",
    subheading: "Continue shopping",
  });

  if (!order) {
    notFound();
  }

  const currency = order.currency_code ?? defaultCurrency;

  return (
    <PageLayout title="Order confirmed">
      <PurchaseTracker order={order} />
      <OrderConfirmedView
        currency={currency}
        heading={copy.heading}
        order={order}
        showOrdersLink={Boolean(customer)}
        subheading={copy.subheading}
      />
    </PageLayout>
  );
}
