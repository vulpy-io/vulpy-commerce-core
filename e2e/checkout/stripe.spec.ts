import { expect } from "@playwright/test";
import { fillRequiredCheckoutDetails, test } from "./fixtures";

const STANDARD_SHIPPING = /standard shipping/i;
const STRIPE = /stripe/i;
const PAY_NOW = /pay now/i;

// Provider frames can contain card details or a payment-session client secret.
test.use({ screenshot: "off", trace: "off", video: "off" });

test("@stripe Stripe checkout initializes one hosted payment form", async ({ checkoutPage }) => {
  await fillRequiredCheckoutDetails(checkoutPage);
  const shipping = checkoutPage.getByRole("radio", { name: STANDARD_SHIPPING });
  await shipping.check();

  const stripe = checkoutPage.getByRole("radio", { name: STRIPE });
  await stripe.check();
  await checkoutPage.getByRole("button", { name: PAY_NOW }).click();

  const stripeFrame = checkoutPage.locator('iframe[name^="__privateStripeFrame"]').first();
  await expect(stripeFrame).toBeVisible({ timeout: 30_000 });
  await expect(checkoutPage.locator('iframe[name^="__privateStripeFrame"]')).toHaveCount(1);
});
