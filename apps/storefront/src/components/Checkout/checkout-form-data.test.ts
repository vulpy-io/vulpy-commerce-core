/**
 * Unit tests for CheckoutAddressForm shape and address builder logic.
 * These run in the node environment (no jsdom required).
 *
 * TDD: RED → GREEN — the typed constant FULL_FORM below constrains the
 * CheckoutAddressForm type to include company and country_code. If either
 * field is missing from the type, TypeScript raises an error on the object
 * literal ("Object literal may only specify known properties").
 */
import { describe, expect, it } from "vitest";
import type { CheckoutAddressForm } from "./CheckoutSteps";
import {
  buildContactShippingAddress,
  createCheckoutFormFromCart,
} from "./checkout-form-data";

// TypeScript enforces this at compile time: if CheckoutAddressForm does not
// include company or country_code, tsc will error on the line below.
const FULL_FORM: CheckoutAddressForm = {
  email: "",
  first_name: "",
  last_name: "",
  company: "",
  phone: "",
  address_1: "",
  address_2: "",
  city: "",
  postal_code: "",
  province: "",
  country_code: "us",
};

describe("CheckoutAddressForm — company and country_code fields", () => {
  it("type includes a company field (optional string)", () => {
    expect(Object.hasOwn(FULL_FORM, "company")).toBe(true);
    expect(FULL_FORM.company).toBe("");
  });

  it("type includes a country_code field defaulting to 'us'", () => {
    expect(Object.hasOwn(FULL_FORM, "country_code")).toBe(true);
    expect(FULL_FORM.country_code).toBe("us");
  });

  it("all required address form keys are present", () => {
    const requiredKeys: Array<keyof CheckoutAddressForm> = [
      "email",
      "first_name",
      "last_name",
      "company",
      "phone",
      "address_1",
      "address_2",
      "city",
      "postal_code",
      "province",
      "country_code",
    ];
    for (const key of requiredKeys) {
      expect(Object.hasOwn(FULL_FORM, key), `form must have key: ${key}`).toBe(true);
    }
  });

  it("company is optional (empty string is valid)", () => {
    const withCompany: CheckoutAddressForm = { ...FULL_FORM, company: "Acme Corp" };
    const withoutCompany: CheckoutAddressForm = { ...FULL_FORM, company: "" };
    expect(withCompany.company).toBe("Acme Corp");
    expect(withoutCompany.company).toBe("");
  });
});

describe("buildContactShippingAddress", () => {
  it("omits company from the result when company field is blank", () => {
    const form: CheckoutAddressForm = {
      ...FULL_FORM,
      company: "",
      first_name: "Anna",
      last_name: "Korhonen",
      address_1: "1 Main St",
      city: "Helsinki",
      postal_code: "00100",
      country_code: "fi",
    };
    const result = buildContactShippingAddress(form);
    expect(result.company).toBeUndefined();
  });

  it("preserves company when it is non-empty", () => {
    const form: CheckoutAddressForm = {
      ...FULL_FORM,
      company: "Acme Corp",
      country_code: "us",
    };
    const result = buildContactShippingAddress(form);
    expect(result.company).toBe("Acme Corp");
  });
});

describe("createCheckoutFormFromCart", () => {
  it("defaults country_code to 'us' when cart has no address", () => {
    // Partial cart with no shipping or billing address
    const result = createCheckoutFormFromCart(null);
    expect(result.country_code).toBe("us");
  });

  it("defaults country_code to 'us' when cart exists but has no address", () => {
    const partialCart = { email: "test@example.com" } as never;
    const result = createCheckoutFormFromCart(partialCart);
    expect(result.country_code).toBe("us");
  });

  it("uses country_code from cart address when present", () => {
    const cartWithAddress = {
      shipping_address: {
        country_code: "gb",
        first_name: "Bob",
      },
    } as never;
    const result = createCheckoutFormFromCart(cartWithAddress);
    expect(result.country_code).toBe("gb");
  });
});
