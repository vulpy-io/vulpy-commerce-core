/**
 * Pure utility functions for building and hydrating the checkout address form.
 * Extracted from CheckoutForm.tsx so they can be unit-tested without React or
 * Stripe dependencies.
 */
import type { HttpTypes } from "@medusajs/types";
import config from "@/config";
import type { CheckoutAddressForm } from "./CheckoutSteps";

/**
 * Maps the UI form back to the Medusa shipping/billing address shape.
 * company is omitted when blank (Medusa treats empty string the same as absent
 * but we normalize here for a clean payload).
 */
export function buildContactShippingAddress(form: CheckoutAddressForm) {
  return {
    first_name: form.first_name,
    last_name: form.last_name,
    company: form.company || undefined,
    phone: form.phone,
    country_code: form.country_code || config.defaultCountryCode,
    address_1: form.address_1 || "-",
    address_2: form.address_2 || "",
    city: form.city || "-",
    postal_code: form.postal_code || "-",
    province: form.province || "",
  };
}

/**
 * Seeds the checkout form from the active cart's saved address.
 * Falls back to config.defaultCountryCode when no address is present.
 */
export function createCheckoutFormFromCart(
  cart: HttpTypes.StoreCart | null
): CheckoutAddressForm {
  const source = cart?.shipping_address ?? cart?.billing_address;

  return {
    email: cart?.email ?? "",
    first_name: source?.first_name ?? "",
    last_name: source?.last_name ?? "",
    company: source?.company ?? "",
    phone: source?.phone ?? "",
    address_1:
      source?.address_1 && source.address_1 !== "-" ? source.address_1 : "",
    address_2: source?.address_2 ?? "",
    city: source?.city && source.city !== "-" ? source.city : "",
    postal_code:
      source?.postal_code && source.postal_code !== "-"
        ? source.postal_code
        : "",
    province: source?.province ?? "",
    country_code: source?.country_code ?? config.defaultCountryCode,
  };
}
