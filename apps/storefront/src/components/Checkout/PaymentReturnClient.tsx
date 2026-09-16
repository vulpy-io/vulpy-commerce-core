"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getPaymentReturnStatusAction,
  type PaymentReturnStatus,
} from "@/app/actions/payment-return";
import PageLayout from "@/components/Common/PageLayout";

export default function PaymentReturnClient() {
  const searchParams = useSearchParams();
  const cartId = searchParams.get("cart_id");
  const [status, setStatus] = useState<PaymentReturnStatus>({ state: "pending" });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await getPaymentReturnStatusAction(cartId);
      if (!cancelled) {
        setStatus(result);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [cartId]);

  if (status.state === "not_found") {
    return (
      <PageLayout title="Payment">
        <section className="py-20">
          <div className="container text-center">
            <h1 className="h1 mb-4">Cart not found</h1>
            <p className="mb-8 text-content-muted">
              Try again or return to checkout to complete your order.
            </p>
            <Link
              className="inline-flex rounded-md bg-action-primary-background px-8 py-3 text-white"
              href="/checkout"
            >
              Back to checkout
            </Link>
          </div>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Payment">
      <section className="py-20">
        <div className="container text-center">
          <h1 className="h1 mb-4">Payment processing</h1>
          <p className="mb-8 text-content-muted">
            If you completed card payment, your order confirmation should appear
            shortly.
          </p>
          <Link
            className="inline-flex rounded-md bg-action-primary-background px-8 py-3 text-white"
            href="/my-account"
          >
            My account
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
