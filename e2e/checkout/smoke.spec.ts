import { expect } from "@playwright/test";
import { test } from "./fixtures";

const PLACE_ORDER = /place order|pay now/i;

test("@smoke seeded cart reaches checkout on the isolated real stack", async ({
  checkoutPage,
}) => {
  await expect(
    checkoutPage.getByRole("heading", { name: "Delivery method" })
  ).toBeVisible();
  await expect(
    checkoutPage.getByRole("heading", { name: "Payment method" })
  ).toBeVisible();
  await expect(checkoutPage.getByRole("heading", { name: "Your order" })).toBeVisible();
  await expect(
    checkoutPage.getByRole("button", { name: PLACE_ORDER })
  ).toBeVisible();
});
