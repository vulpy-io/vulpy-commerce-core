import { expect, type Locator, type Page } from "@playwright/test";
import { fillRequiredCheckoutDetails, test } from "./fixtures";

const FIRST_NAME = /first name/i;
const STANDARD_SHIPPING = /standard shipping/i;
const STRIPE_PAYMENT_RADIO = /stripe|credit card/i;
const SUBMIT_ORDER = /place order|pay now/i;

async function assertRealCheckoutLoaded(page: Page) {
  await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delivery method" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment method" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your order" })).toBeVisible();
}

async function expectLeftOf(left: Locator, right: Locator) {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  expect(leftBox, "left checkout section must have a layout box").not.toBeNull();
  expect(rightBox, "right checkout section must have a layout box").not.toBeNull();
  if (!(leftBox && rightBox)) {
    throw new Error("checkout layout boxes are required");
  }
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(rightBox.x);
}

test("@structural desktop checkout keeps details left of the order summary", async ({ checkoutPage }) => {
  await checkoutPage.setViewportSize({ width: 1440, height: 900 });
  await assertRealCheckoutLoaded(checkoutPage);
  await expectLeftOf(
    checkoutPage.getByRole("heading", { name: "Contact details" }),
    checkoutPage.getByRole("heading", { name: "Your order" })
  );
});

test("@structural mobile checkout remains usable without horizontal overflow", async ({ checkoutPage }) => {
  await checkoutPage.setViewportSize({ width: 390, height: 844 });
  await assertRealCheckoutLoaded(checkoutPage);
  const dimensions = await checkoutPage.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await expect(checkoutPage.getByLabel(FIRST_NAME)).toBeInViewport();
});

test("@structural keyboard reaches labeled shipping, payment, and submit controls", async ({ checkoutPage }) => {
  await fillRequiredCheckoutDetails(checkoutPage);
  const shipping = checkoutPage.getByRole("radio", { name: STANDARD_SHIPPING });
  const payment = checkoutPage.getByRole("radio", { name: STRIPE_PAYMENT_RADIO });
  const submit = checkoutPage.getByRole("button", { name: SUBMIT_ORDER });

  await shipping.focus();
  await expect(shipping).toBeFocused();
  await checkoutPage.keyboard.press("Space");
  await expect(shipping).toBeChecked();

  await payment.focus();
  await expect(payment).toBeFocused();
  await checkoutPage.keyboard.press("Space");
  await expect(payment).toBeChecked();

  await submit.focus();
  await expect(submit).toBeFocused();
});
