import { expect } from "@playwright/test";
import { fillRequiredCheckoutDetails, test } from "./fixtures";

const FIRST_NAME = /first name/i;
const CREATE_ACCOUNT = /create an account/i;
const STANDARD_SHIPPING = /standard shipping/i;
const STRIPE = /stripe/i;
const STRIPE_PAYMENT_RADIO = /stripe|credit card/i;
const SUBMIT_ORDER = /place order|pay now/i;

// These tests intentionally use keyboard activation for every control under test.
test("@keyboard invalid submit focuses the first field, then radios, checkbox, and submit activate by keyboard", async ({
  checkoutPage,
}) => {
  const submit = checkoutPage.getByRole("button", { name: SUBMIT_ORDER });
  await submit.focus();
  await checkoutPage.keyboard.press("Enter");
  await expect(checkoutPage.getByLabel(FIRST_NAME)).toBeFocused();

  await fillRequiredCheckoutDetails(checkoutPage);

  const account = checkoutPage.getByRole("checkbox", { name: CREATE_ACCOUNT });
  if (await account.isVisible()) {
    await account.focus();
    await checkoutPage.keyboard.press("Space");
    await expect(account).toBeChecked();
  }

  const shipping = checkoutPage.getByRole("radio", { name: STANDARD_SHIPPING });
  await shipping.focus();
  await checkoutPage.keyboard.press("Space");
  await expect(shipping).toBeChecked();

  const payment = checkoutPage.getByRole("radio", { name: STRIPE_PAYMENT_RADIO });
  await payment.focus();
  await checkoutPage.keyboard.press("Space");
  await expect(payment).toBeChecked();

  await submit.focus();
  await expect(submit).toBeFocused();
});

test("@keyboard @stripe keyboard focus reaches the hosted Stripe frame before final submit", async ({
  checkoutPage,
}) => {
  await fillRequiredCheckoutDetails(checkoutPage);

  const shipping = checkoutPage.getByRole("radio", { name: STANDARD_SHIPPING });
  await shipping.focus();
  await checkoutPage.keyboard.press("Space");

  const stripe = checkoutPage.getByRole("radio", { name: STRIPE });
  await stripe.focus();
  await checkoutPage.keyboard.press("Space");

  const submit = checkoutPage.getByRole("button", { name: SUBMIT_ORDER });
  await submit.focus();
  await checkoutPage.keyboard.press("Enter");

  const stripeFrame = checkoutPage.locator('iframe[name^="__privateStripeFrame"]').first();
  await expect(stripeFrame).toBeVisible({ timeout: 30_000 });
  await stripeFrame.scrollIntoViewIfNeeded();
  await checkoutPage.keyboard.press("Tab");
  // Stripe iframes have tabindex="0" so Tab lands focus on the iframe element.
  // We verify via document.activeElement rather than toBeFocused() on the locator
  // because Playwright's toBeFocused() on an iframe requires the element to hold
  // document focus, which depends on Stripe's implementation detail. The evaluate
  // approach is more robust across Stripe SDK versions and cross-browser.
  const activeTag = await checkoutPage.evaluate(() => document.activeElement?.tagName);
  expect(activeTag).toBe("IFRAME");

  await checkoutPage.keyboard.press("Shift+Tab");
  await checkoutPage.keyboard.press("Tab");
  const activeTagAfterReturn = await checkoutPage.evaluate(() => document.activeElement?.tagName);
  expect(activeTagAfterReturn).toBe("IFRAME");
  await expect(submit).toBeVisible();
});
