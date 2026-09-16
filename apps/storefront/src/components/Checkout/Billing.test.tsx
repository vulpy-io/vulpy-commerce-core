/**
 * Unit tests for the Billing component.
 * Tests the "Bill to a different address?" toggle and form field structure.
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config", () => ({
  default: { defaultCountryCode: "us", customerAccountsEnabled: false },
}));

import Billing from "./Billing";
import type { CheckoutAddressForm } from "./CheckoutSteps";

const EMPTY_FORM: CheckoutAddressForm = {
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

const FILLED_FORM: CheckoutAddressForm = {
  email: "billing@example.com",
  first_name: "Jane",
  last_name: "Doe",
  company: "Acme Corp",
  phone: "+1 555 000 0001",
  address_1: "99 Billing Blvd",
  address_2: "Suite 5",
  city: "Billingtown",
  postal_code: "99999",
  province: "CA",
  country_code: "us",
};

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for testing
function noop() {}

// Top-level regexes (lint: useTopLevelRegex)
const BILLING_PROVINCE_SELECT = /<select[^>]*id="billing-province"/;
const BILLING_PROVINCE_INPUT = /<input[^>]*id="billing-province"/;

describe("Billing — default (sameAsShipping = true)", () => {
  it("renders a heading with Billing details", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={EMPTY_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={true}
      />
    );
    expect(html).toContain("Billing details");
  });

  it("renders the 'Bill to a different address?' toggle label", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={EMPTY_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={true}
      />
    );
    expect(html).toContain("Bill to a different address?");
  });

  it("does NOT render billing address fields when sameAsShipping is true", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={EMPTY_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={true}
      />
    );
    // Full billing form should not be rendered when same-as-shipping is ON
    expect(html).not.toContain("billing-firstName");
    expect(html).not.toContain("billing-city");
  });
});

describe("Billing — separate billing address (sameAsShipping = false)", () => {
  it("renders billing address fields when sameAsShipping is false", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("billing-firstName");
    expect(html).toContain("billing-lastName");
    expect(html).toContain("billing-city");
    expect(html).toContain("billing-postalCode");
  });

  it("renders First name and Last name fields", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    // Labels
    expect(html).toContain("First name");
    expect(html).toContain("Last name");
  });

  it("renders Company field labeled 'Company (optional)'", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("Company (optional)");
    expect(html).toContain("billing-company");
  });

  it("renders Address field for address line 1", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    // Address line 1 label: "Address"
    expect(html).toContain("billing-address1");
  });

  it("renders address line 2 labeled 'Apartment, suite, etc. (optional)'", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("Apartment, suite, etc.");
    expect(html).toContain("billing-address2");
  });

  it("renders City and Postal code fields", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("City");
    expect(html).toContain("Postal code");
  });

  it("renders US State dropdown when country is us", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    // FILLED_FORM defaults to country_code "us" → State dropdown with asterisk
    expect(html).toContain("State");
    expect(html).toMatch(BILLING_PROVINCE_SELECT);
    expect(html).toContain("Select a state");
    expect(html).toContain("California");
    expect(html).not.toContain("State / Province");
  });

  it("renders free-text State / Province input for non-US countries", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={{ ...FILLED_FORM, country_code: "ca" }}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("State / Province");
    expect(html).toMatch(BILLING_PROVINCE_INPUT);
    expect(html).not.toMatch(BILLING_PROVINCE_SELECT);
  });

  it("renders Country select with default country option when no regionCountries provided", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("billing-countryCode");
    // With no regionCountries, falls back to config.defaultCountryCode ("us" → "US")
    expect(html).toContain('value="us"');
  });

  it("renders Phone field", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("billing-phone");
  });

  it("reflects filled form values in rendered HTML", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("Jane");
    expect(html).toContain("Doe");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("99 Billing Blvd");
    expect(html).toContain("Billingtown");
    expect(html).toContain("99999");
  });
});

describe("Billing — regionCountries prop", () => {
  it("renders country options from regionCountries when provided", () => {
    const regionCountries = [
      { id: "ctry_de", iso_2: "de", display_name: "Germany" },
      { id: "ctry_fr", iso_2: "fr", display_name: "France" },
    ];
    const html = renderToStaticMarkup(
      <Billing
        billingForm={{ ...FILLED_FORM, country_code: "de" }}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        regionCountries={regionCountries}
        sameAsShipping={false}
      />
    );
    expect(html).toContain('value="de"');
    expect(html).toContain("Germany");
    expect(html).toContain('value="fr"');
    expect(html).toContain("France");
    // Should NOT contain hardcoded "United States" when region overrides it
    expect(html).not.toContain("United States");
  });

  it("falls back to config.defaultCountryCode option when regionCountries is empty", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        regionCountries={[]}
        sameAsShipping={false}
      />
    );
    expect(html).toContain("billing-countryCode");
    // Falls back to a single option for the default country
    expect(html).toContain('value="us"');
  });
});

describe("Billing — toggle checkbox attributes", () => {
  it("toggle checkbox is NOT checked when sameAsShipping is true (form is hidden)", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={EMPTY_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={true}
      />
    );
    // The checkbox for "Bill to a different address?" should NOT be checked
    // when sameAsShipping is true (i.e., different address toggle is OFF)
    expect(html).toContain('id="billDifferentAddress"');
    // When sameAsShipping=true, the checkbox is unchecked (different address = false)
    expect(html).not.toContain('checked="" id="billDifferentAddress"');
  });

  it("toggle checkbox is checked when sameAsShipping is false (form is shown)", () => {
    const html = renderToStaticMarkup(
      <Billing
        billingForm={FILLED_FORM}
        onBillingFormChange={noop}
        onSameAsShippingChange={noop}
        sameAsShipping={false}
      />
    );
    // When sameAsShipping=false, the "Bill to a different address?" box IS checked
    expect(html).toContain("checked");
    expect(html).toContain('id="billDifferentAddress"');
  });
});
