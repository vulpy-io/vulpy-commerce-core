/**
 * Unit tests for CheckoutSteps — ShippingInformationStep country select.
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config", () => ({
  default: { defaultCountryCode: "us", customerAccountsEnabled: false },
}));
vi.mock("@stripe/react-stripe-js", () => ({
  PaymentElement: () => <div data-testid="payment-element">Payment Element</div>,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions/customer", () => ({ loginCustomerAction: vi.fn() }));
vi.mock("@/components/Auth/CustomerLoginForm", () => ({ CustomerLoginForm: () => null }));
vi.mock("@/components/Common/PaymentMethodIcons", () => ({ default: () => null }));
vi.mock("@/components/Product/GatedAmount", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/cms/types", () => ({}));
vi.mock("@/lib/medusa/asset-url", () => ({
  PRODUCT_PLACEHOLDER_IMAGE: "/placeholder.png",
  resolveMedusaAssetUrlOrFallback: (url: string | null) => url ?? "/placeholder.png",
}));
vi.mock("@/lib/medusa/cart-totals", () => ({
  getCartGrandTotal: vi.fn(() => 0),
  getCartItemsSubtotal: vi.fn(() => 0),
  getCartShippingTotal: vi.fn(() => 0),
}));
vi.mock("@/lib/medusa/money", () => ({
  fromMedusaAmount: vi.fn((v: number) => v),
}));
vi.mock("@/lib/medusa/product-options", () => ({
  formatCartLineItemOptions: vi.fn(() => ""),
}));
vi.mock("@/lib/medusa/payment-providers", () => ({
  getPaymentProviderLabel: vi.fn((id: string) => id),
}));
vi.mock("next/dist/client/components/redirect-error", () => ({
  isRedirectError: vi.fn(() => false),
}));

import type { HttpTypes } from "@medusajs/types";
import type React from "react";
import { type CheckoutAddressForm, PaymentInformationStep, ShippingInformationStep } from "./CheckoutSteps";

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

// Top-level regexes (lint: useTopLevelRegex)
const EMAIL_LABEL_REQUIRED = /for="email">Email <span class="text-status-danger">\*<\/span>/;
const EMAIL_OPTIONAL_MARKER = /for="email">Email[\s\S]*\(optional\)/;
const EMAIL_INPUT_REQUIRED = /<input[^>]*id="email"[^>]*required=""/;
const EMAIL_INPUT_TYPE = /<input[^>]*id="email"[^>]*type="email"/;
const PROVINCE_INPUT = /<input[^>]*id="province"/;
const PROVINCE_SELECT = /<select[^>]*id="province"/;

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for testing
function noop() {}

describe("PaymentInformationStep — Stripe panel", () => {
  it("renders PaymentElement inside the selected Stripe provider card", () => {
    const html = renderToStaticMarkup(
      <PaymentInformationStep
        isStripe
        onSelectPayment={noop}
        paymentProviders={[{ id: "pp_stripe" } as HttpTypes.StorePaymentProvider]}
        paymentSessionReady
        selectedPayment="pp_stripe"
      >
        {null}
      </PaymentInformationStep>
    );

    expect(html).toContain('data-testid="payment-element"');
    expect(html.indexOf('data-testid="payment-element"')).toBeGreaterThan(
      html.indexOf("pp_stripe")
    );
  });

  it("does not render PaymentElement for an unselected COD provider", () => {
    const html = renderToStaticMarkup(
      <PaymentInformationStep
        isStripe={false}
        onSelectPayment={noop}
        paymentProviders={[{ id: "system_default" } as HttpTypes.StorePaymentProvider]}
        paymentSessionReady
        selectedPayment="system_default"
      >
        {null}
      </PaymentInformationStep>
    );

    expect(html).not.toContain('data-testid="payment-element"');
  });
});

describe("ShippingInformationStep — country select", () => {
  it("renders a country select element", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep form={EMPTY_FORM} onChange={noop} />
    );
    expect(html).toContain('id="countryCode"');
  });

  it("renders region countries as options when regionCountries is provided", () => {
    const regionCountries = [
      { id: "ctry_de", iso_2: "de", display_name: "Germany" },
      { id: "ctry_fr", iso_2: "fr", display_name: "France" },
      { id: "ctry_ch", iso_2: "ch", display_name: "Switzerland" },
    ];
    const html = renderToStaticMarkup(
      <ShippingInformationStep
        form={{ ...EMPTY_FORM, country_code: "de" }}
        onChange={noop}
        regionCountries={regionCountries}
      />
    );
    expect(html).toContain('value="de"');
    expect(html).toContain("Germany");
    expect(html).toContain('value="fr"');
    expect(html).toContain("France");
    expect(html).toContain('value="ch"');
    expect(html).toContain("Switzerland");
    // Should NOT contain hardcoded "United States" when region overrides it
    expect(html).not.toContain("United States");
  });

  it("falls back to config.defaultCountryCode option when regionCountries is empty", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep
        form={EMPTY_FORM}
        onChange={noop}
        regionCountries={[]}
      />
    );
    expect(html).toContain('id="countryCode"');
    // Falls back to a single option for the default country
    expect(html).toContain('value="us"');
  });

  it("falls back to config.defaultCountryCode option when regionCountries is not provided", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep form={EMPTY_FORM} onChange={noop} />
    );
    expect(html).toContain('id="countryCode"');
    expect(html).toContain('value="us"');
  });
});

describe("ShippingInformationStep — email required", () => {
  it("marks the email label as required (asterisk)", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep form={EMPTY_FORM} onChange={noop} />
    );
    expect(html).toMatch(EMAIL_LABEL_REQUIRED);
    // Email must NOT be labelled optional (other fields may be)
    expect(html).not.toMatch(EMAIL_OPTIONAL_MARKER);
  });

  it("renders the email input with required attribute", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep form={EMPTY_FORM} onChange={noop} />
    );
    expect(html).toContain('id="email"');
    // Attribute order is not guaranteed — match both on the email input
    expect(html).toMatch(EMAIL_INPUT_REQUIRED);
    expect(html).toMatch(EMAIL_INPUT_TYPE);
  });
});

describe("ShippingInformationStep — US state dropdown", () => {
  it("renders a state select when country is us", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep form={EMPTY_FORM} onChange={noop} />
    );
    expect(html).toContain('id="province"');
    expect(html).toContain("<select");
    expect(html).toContain("Select a state");
    expect(html).toContain("California");
    expect(html).toContain("New York");
  });

  it("renders a free-text state/province input for non-US countries", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep
        form={{ ...EMPTY_FORM, country_code: "ca" }}
        onChange={noop}
      />
    );
    // Province must be an input, NOT a select (country select is always present)
    expect(html).toMatch(PROVINCE_INPUT);
    expect(html).not.toMatch(PROVINCE_SELECT);
    expect(html).toContain("State / Province");
  });

  it("labels the field 'State' with asterisk when country is us", () => {
    const html = renderToStaticMarkup(
      <ShippingInformationStep form={EMPTY_FORM} onChange={noop} />
    );
    expect(html).toContain("State");
    expect(html).toContain("text-status-danger");
  });
});

describe("us-states module", () => {
  it("exports 50 states plus DC", async () => {
    const { US_STATES, isUsCountry } = await import("./us-states");
    expect(US_STATES).toHaveLength(51);
    expect(US_STATES[0]).toEqual({ value: "AL", label: "Alabama" });
    expect(US_STATES[50]).toEqual({ value: "WY", label: "Wyoming" });
    expect(isUsCountry("us")).toBe(true);
    expect(isUsCountry("US")).toBe(true);
    expect(isUsCountry("ca")).toBe(false);
  });
});
