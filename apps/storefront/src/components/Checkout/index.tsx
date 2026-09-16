import Link from "next/link";
import {
  getPaymentProvidersAction,
  getShippingOptionsAction,
} from "@/app/actions/checkout";
import CartIssuesNotice from "@/components/Cart/CartIssuesNotice";
import { getSiteSettings } from "@/lib/cms/queries";
import { getStoreCart } from "@/lib/data";
import { getCustomer } from "@/lib/medusa/customer";
import CheckoutForm from "./CheckoutForm";
import CheckoutLayout from "./CheckoutLayout";

export default async function Checkout() {
  const [storeCart, customer, siteSettings] = await Promise.all([
    getStoreCart(),
    getCustomer(),
    getSiteSettings(),
  ]);
  const { cart, issues, checkoutBlocked } = storeCart;

  if (!cart?.items?.length) {
    return (
      <CheckoutLayout siteSettings={siteSettings}>
        <div className="py-20 text-center">
          <p className="pb-6">Your cart is empty.</p>
          <Link
            className="mx-auto inline-flex rounded-md bg-surface-inverse px-6 py-3 font-semibold text-white"
            href="/shop"
          >
            Continue shopping
          </Link>
        </div>
      </CheckoutLayout>
    );
  }

  if (checkoutBlocked) {
    return (
      <CheckoutLayout siteSettings={siteSettings}>
        <div className="container py-20">
          <div className="mx-auto max-w-2xl space-y-6">
            <CartIssuesNotice issues={issues} />
            <p className="text-center text-content-primary">
              Checkout is unavailable while your cart contains out-of-stock items.
            </p>
            <div className="flex justify-center">
              <Link
                className="inline-flex rounded-md bg-surface-inverse px-6 py-3 font-semibold text-white"
                href="/cart"
              >
                Back to cart
              </Link>
            </div>
          </div>
        </div>
      </CheckoutLayout>
    );
  }

  return (
    <CheckoutForm
      customerEmail={customer?.email}
      initialCart={cart}
      initialPaymentProviders={
        cart.region_id
          ? (await getPaymentProvidersAction(cart.region_id)) ?? []
          : []
      }
      initialShippingOptions={(await getShippingOptionsAction(cart.id)) ?? []}
      paymentMethods={siteSettings.paymentMethods}
      siteSettings={siteSettings}
    />
  );
}
