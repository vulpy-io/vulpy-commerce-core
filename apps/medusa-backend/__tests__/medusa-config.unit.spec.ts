import { getStripePaymentProviders } from "../medusa-config";

describe("getStripePaymentProviders", () => {
  it("does not register Stripe when the server key is absent", () => {
    expect(getStripePaymentProviders("")).toEqual([]);
  });

  it.each(["«redacted:sk_test_…»", "«redacted:sk_live_…»"])(
    "registers Stripe when the server key %s is present",
    (apiKey) => {
      expect(getStripePaymentProviders(apiKey)).toEqual([
        {
          resolve: "@medusajs/medusa/payment-stripe",
          id: "stripe",
          options: { apiKey },
        },
      ]);
    }
  );
});
