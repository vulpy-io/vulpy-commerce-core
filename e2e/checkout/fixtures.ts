import { test as base, type Page, expect as playwrightExpect } from "@playwright/test";

export const CHECKOUT_E2E_PRODUCT_HANDLE = "checkout-e2e-product";
export const CHECKOUT_E2E_PRODUCT_TITLE = "Checkout E2E Product";
const REJECT_CONSENT = /reject|necessary only/i;
const ADD_TO_CART = /^add to cart$/i;
const CONTACT_DETAILS = /contact details/i;
const FIRST_NAME = /first name/i;
const LAST_NAME = /last name/i;
const ADDRESS = /^address/i;
const CITY = /city/i;
const POSTAL_CODE = /postal code/i;
const PHONE = /phone/i;
const EMAIL = /email/i;

export const TEST_CUSTOMER = {
  address: "121 Test Street",
  city: "Testville",
  email: "checkout-e2e@example.invalid",
  firstName: "Checkout",
  lastName: "Harness",
  phone: "+1 415 555 0100",
  postalCode: "94105",
} as const;

async function dismissConsent(page: Page) {
  const reject = page.getByRole("button", { name: REJECT_CONSENT });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
  }
}

export async function reachCheckoutFromSeededCatalog(page: Page) {
  await page.goto(`/products/${CHECKOUT_E2E_PRODUCT_HANDLE}`);
  await dismissConsent(page);

  const addToCart = page.getByRole("button", { name: ADD_TO_CART });
  await playwrightExpect(addToCart, "dedicated checkout fixture must be purchasable").toBeVisible();
  await addToCart.click();
  await playwrightExpect(
    page.getByText(CHECKOUT_E2E_PRODUCT_TITLE).first(),
    "the fixture product must be present before checkout"
  ).toBeVisible();

  await page.goto("/checkout");
  await playwrightExpect(page.getByRole("heading", { name: CONTACT_DETAILS })).toBeVisible();
  await playwrightExpect(page.getByRole("heading", { name: "Your order" })).toBeVisible();
  const authoritativeOrderLine = page.getByText(CHECKOUT_E2E_PRODUCT_TITLE).locator("..");
  await playwrightExpect(authoritativeOrderLine).toBeVisible();
  await playwrightExpect(authoritativeOrderLine).toContainText("x 1");
}

export async function fillRequiredCheckoutDetails(page: Page) {
  await page.getByLabel(FIRST_NAME).fill(TEST_CUSTOMER.firstName);
  await page.getByLabel(LAST_NAME).fill(TEST_CUSTOMER.lastName);
  await page.getByLabel(ADDRESS).fill(TEST_CUSTOMER.address);
  await page.getByLabel(CITY).fill(TEST_CUSTOMER.city);
  await page.getByLabel(POSTAL_CODE).fill(TEST_CUSTOMER.postalCode);
  await page.getByLabel(PHONE).fill(TEST_CUSTOMER.phone);
  await page.getByLabel(EMAIL).fill(TEST_CUSTOMER.email);
}

interface CheckoutFixtures {
  checkoutPage: Page;
}

export const test = base.extend<CheckoutFixtures>({
  storageState: { cookies: [], origins: [] },
  checkoutPage: async ({ page }, use) => {
    // Defense-in-depth: clear any residual cookies before each test.
    // The storageState above is the primary isolation mechanism; this ensures
    // cookie state is clean even if a future test adds context reuse.
    // workers: 1 makes the storageState approach safe today (no parallel contexts).
    await page.context().clearCookies();
    await reachCheckoutFromSeededCatalog(page);
    await use(page);
  },
});
