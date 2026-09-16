"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pollPaymentReturnServerAction } from "@/app/actions/poll-payment-return";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { trackCustomEvent } from "@/lib/analytics";
import { submitPaymentSuccessOnce } from "@/lib/analytics/checkout-analytics";
import {
  DELAYS,
  MAX_ATTEMPTS,
  type PollResult,
} from "@/lib/medusa/payment-return-poller";

type PollerState =
  | { phase: "polling" }
  | { phase: "timeout" }
  | { phase: "done"; orderId: string };

// ---------------------------------------------------------------------------
// handlePollResult — exported for unit testing
// ---------------------------------------------------------------------------

export interface HandlePollResultDeps {
  hasAnalytics: boolean;
  trackEvent: (category: string, action: string, label: string) => void;
  router: { replace: (url: string) => void };
}

/**
 * Pure result-handler: fires the analytics event and redirects.
 * Extracted so it can be tested in the node environment without jsdom.
 *
 * Uses submitPaymentSuccessOnce so payment_success fires at most once
 * per orderId per session, even if both CheckoutForm and the poller
 * complete for the same order.
 */
export function handlePollResult(
  result: PollResult,
  deps: HandlePollResultDeps
): void {
  if (result.outcome === "success") {
    // Fire analytics before redirect — consent-gated, deduplicated
    submitPaymentSuccessOnce(result.orderId, deps.hasAnalytics, deps.trackEvent, "stripe_return");

    if (result.orderId) {
      deps.router.replace(`/order/confirmed/${result.orderId}`);
    } else {
      // Cart was already completed but we don't have the orderId here —
      // send to my-account as fallback; the order will be in the list.
      deps.router.replace("/my-account");
    }
  }
}

// ---------------------------------------------------------------------------
// PaymentFailureTracker — client component for 3DS redirect failure analytics
// ---------------------------------------------------------------------------

/**
 * Mounts invisibly and fires a consent-gated payment_failure event when
 * the Stripe 3DS redirect returns with redirect_status=failed.
 * Rendered by the payment-return page in the failure branch.
 */
export function PaymentFailureTracker(): null {
  const hasAnalytics = useHasAnalyticsConsent();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !hasAnalytics) {
      return;
    }
    firedRef.current = true;
    trackCustomEvent("Checkout", "payment_failure", "stripe_3ds");
  }, [hasAnalytics]);

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentReturnPoller() {
  const router = useRouter();
  const hasAnalytics = useHasAnalyticsConsent();
  const [state, setState] = useState<PollerState>({ phase: "polling" });
  const ranRef = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invocation
    if (ranRef.current) {
      return;
    }
    ranRef.current = true;

    let cancelled = false;

    async function run() {
      const result: PollResult = await pollPaymentReturnServerAction();

      if (cancelled) {
        return;
      }

      if (result.outcome === "success") {
        handlePollResult(result, {
          hasAnalytics,
          trackEvent: trackCustomEvent,
          router,
        });
        setState({ phase: "done", orderId: result.orderId });
      } else {
        setState({ phase: "timeout" });
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router, hasAnalytics]);

  if (state.phase === "polling") {
    return (
      <section className="py-20">
        <div className="container text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-content-primary"
          />
          <h1 className="h1 mb-4">
            Confirming your order...
          </h1>
          <p className="text-content-muted text-sm">
            Please wait while we confirm your payment.
          </p>
        </div>
      </section>
    );
  }

  if (state.phase === "done") {
    // Redirecting — render nothing (router.replace already called)
    return null;
  }

  // Timeout — unknown status — never claim payment failed
  return (
    <section className="py-20">
      <div className="container text-center">
        <h1 className="h1 mb-4">
          Your payment is being processed.
        </h1>
        <p className="mb-2 text-content-muted">
          Do not pay again — your payment may already be complete.
        </p>
        <p className="mb-8 text-content-muted">
          Check your email for a confirmation, or contact support.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            className="inline-flex rounded-md bg-action-primary-background px-8 py-3 font-medium text-white"
            href="/my-account"
          >
            Check order status
          </Link>
          <Link
            className="inline-flex rounded-md border border-gray-300 px-8 py-3 font-medium text-content-primary"
            href="/contact"
          >
            Contact support
          </Link>
        </div>
      </div>
    </section>
  );
}

// Re-export constants so tests can import from this module if needed
export { DELAYS, MAX_ATTEMPTS };
