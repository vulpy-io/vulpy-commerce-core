import { loadStripe } from "@stripe/stripe-js";

if (process.env.NODE_ENV === "development") {
  const key = process.env.NEXT_PUBLIC_STRIPE_KEY ?? "";
  if (key && !key.startsWith("pk_test_") && !key.startsWith("pk_live_")) {
    console.warn(
      "[stripe] NEXT_PUBLIC_STRIPE_KEY does not look like a valid Stripe publishable key"
    );
  }
}

/**
 * Singleton Stripe.js promise.
 *
 * Resolves to a Stripe instance when NEXT_PUBLIC_STRIPE_KEY is set, or null
 * when the key is absent (disables Stripe Elements in the checkout UI).
 *
 * If this is null, the checkout UI should show a configuration error message
 * (e.g. "Payment is unavailable — please contact support") rather than
 * rendering a broken or empty payment form. The missing key means Stripe was
 * not configured for this environment.
 *
 * Import this instead of calling loadStripe() directly so the script is
 * fetched only once per page lifecycle.
 */
export const stripePromise = process.env.NEXT_PUBLIC_STRIPE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY)
  : null;
