import Link from "next/link";
import { Suspense } from "react";
import PaymentReturnPoller, { PaymentFailureTracker } from "@/components/Checkout/PaymentReturnPoller";
import PageLayout from "@/components/Common/PageLayout";
import { parseRedirectStatus } from "@/lib/medusa/payment-return-poller";

type Props = {
  searchParams: Promise<{
    payment_intent?: string;
    payment_intent_client_secret?: string;
    redirect_status?: string;
  }>;
};

export default async function PaymentReturnPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectStatus = parseRedirectStatus(params.redirect_status ?? null);

  // Stripe signalled a definitive failure — show failure UI immediately, no polling
  if (redirectStatus === "failed") {
    return (
      <PageLayout title="Payment">
        <PaymentFailureTracker />
        <section className="py-20">
          <div className="container text-center">
            <h1 className="h1 mb-4">
              Your payment was not completed.
            </h1>
            <p className="mb-8 text-content-muted">
              No charge was made. Please return to checkout and try again.
            </p>
            <Link
              className="inline-flex rounded-md bg-action-primary-background px-8 py-3 font-medium text-white"
              href="/checkout"
            >
              Return to checkout
            </Link>
          </div>
        </section>
      </PageLayout>
    );
  }

  // Succeeded or status unknown — hand off to client poller
  return (
    <PageLayout title="Payment">
      <Suspense
        fallback={
          <div className="py-20 text-center text-content-muted">
            Confirming your order...
          </div>
        }
      >
        <PaymentReturnPoller />
      </Suspense>
    </PageLayout>
  );
}
