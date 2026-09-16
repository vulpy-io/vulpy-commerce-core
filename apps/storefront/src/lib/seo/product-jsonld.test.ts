import { describe, expect, it } from "vitest";
import { buildProductJsonLd } from "./product-jsonld";

const product = {
  title: "Shirt",
  description: "A shirt",
  images: ["/img.jpg"],
  attributes: [{ label: "Brand", value: "Acme" }],
  variants: [
    { id: "v1", sku: "SKU1", price: 10, discountedPrice: 10, inStock: true },
    { id: "v2", sku: "SKU2", price: 12, discountedPrice: 12, inStock: true },
  ],
} as never;

describe("buildProductJsonLd", () => {
  it("uses region currency and AggregateOffer for price range", () => {
    const json = buildProductJsonLd(product, "/products/shirt", {
      currencyCode: "uah",
    });
    expect(json.offers.priceCurrency).toBe("UAH");
    expect(json.offers["@type"]).toBe("AggregateOffer");
    expect(json.brand).toEqual({ "@type": "Brand", name: "Acme" });
    expect(json.offers.shippingDetails).toBeUndefined();
    expect(json.offers.hasMerchantReturnPolicy).toBeUndefined();
  });

  it("attaches merchant shipping/return only when complete", () => {
    const json = buildProductJsonLd(product, "/products/shirt", {
      currencyCode: "usd",
      merchantListing: {
        returnDays: 14,
        returnFees: "free",
        returnCountry: "us",
        shippingRate: 10,
        shippingCurrency: "usd",
        deliveryTimeMinDays: 2,
        deliveryTimeMaxDays: 5,
        shippingDestinationCountry: "us",
      },
    });
    expect(json.offers.shippingDetails?.["@type"]).toBe("OfferShippingDetails");
    expect(json.offers.hasMerchantReturnPolicy?.["@type"]).toBe(
      "MerchantReturnPolicy"
    );
  });
});
