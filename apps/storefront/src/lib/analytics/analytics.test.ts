import { describe, expect, it, vi } from "vitest";
import {
  applyGpcDenial,
  createStoredConsent,
  defaultConsentChoices,
  parseStoredConsent,
  resolveEffectiveChoices,
} from "./consent";
import { oncePerKey, resetDedupeForTests } from "./dedupe";
import {
  cartCouponCode,
  diffCartEcommerceItems,
  mapCartToEcommerceItems,
  mapOrderToEcommerceOrder,
  shouldTrackCartMutation,
} from "./ecommerce";
import { catalogListIdentity } from "./events";
import {
  buildSafePageUrl,
  hashAnalyticsUserId,
  pseudonymizeOrderId,
  sanitizeSearchParams,
} from "./sanitize";

describe("consent", () => {
  it("parses a valid versioned consent cookie", () => {
    const stored = createStoredConsent({ analytics: true, preferences: true });
    const parsed = parseStoredConsent(JSON.stringify(stored));
    expect(parsed?.choices.analytics).toBe(true);
    expect(parsed?.choices.necessary).toBe(true);
  });

  it("rejects wrong version or invalid JSON", () => {
    expect(parseStoredConsent("{")).toBeNull();
    expect(
      parseStoredConsent(JSON.stringify({ version: 999, updatedAt: "x", choices: {} }))
    ).toBeNull();
  });

  it("treats GPC as full denial of optional purposes", () => {
    const denied = applyGpcDenial(defaultConsentChoices());
    expect(denied).toEqual({
      necessary: true,
      analytics: false,
      preferences: false,
      externalMedia: false,
    });
    expect(resolveEffectiveChoices(createStoredConsent({ analytics: true }), true).analytics).toBe(
      false
    );
  });
});

describe("sanitize", () => {
  it("strips sensitive query params and allowlists safe ones", () => {
    expect(sanitizeSearchParams("?q=shoes&email=a@b.com&token=secret")).toBe("?q=shoes");
    expect(buildSafePageUrl("/shop/", "?q=hat&utm_source=x&password=no")).toBe(
      "/shop?q=hat&utm_source=x"
    );
  });

  it("pseudonymizes order ids stably without exposing the raw id", () => {
    const a = pseudonymizeOrderId("order_01ABC");
    const b = pseudonymizeOrderId("order_01ABC");
    expect(a).toBe(b);
    expect(a.startsWith("ord_")).toBe(true);
    expect(a).not.toContain("order_01ABC");
  });

  it("hashes customer ids for GA4 user_id without exposing raw cus_ ids", () => {
    const a = hashAnalyticsUserId("cus_01ABC");
    const b = hashAnalyticsUserId("cus_01ABC");
    expect(a).toBe(b);
    expect(a.startsWith("uid_")).toBe(true);
    expect(a).not.toContain("cus_01ABC");
  });
});

describe("catalog lists", () => {
  it("builds stable list ids for shop surfaces", () => {
    expect(catalogListIdentity({ categoryHandle: "shirts" }).listId).toBe(
      "category:shirts"
    );
    expect(catalogListIdentity({ catalogScope: "sale" }).listId).toBe("sale");
    expect(catalogListIdentity({}).listId).toBe("shop");
  });
});

describe("coupons", () => {
  it("reads the first promotion code from a cart", () => {
    expect(
      cartCouponCode({
        promotions: [{ code: "SAVE10" }, { code: "OTHER" }],
      } as never)
    ).toBe("SAVE10");
    expect(cartCouponCode({} as never)).toBeUndefined();
  });
});

describe("ecommerce mapping", () => {
  it("maps cart lines with major-unit prices", () => {
    const items = mapCartToEcommerceItems({
      currency_code: "usd",
      items: [
        {
          id: "li_1",
          variant_id: "variant_1",
          title: "Shirt",
          quantity: 2,
          unit_price: 10.5,
        },
      ],
    } as never);
    expect(items[0]).toMatchObject({
      sku: "variant_1",
      price: 10.5,
      quantity: 2,
    });
  });

  it("maps orders with pseudonymized id and major units", () => {
    const mapped = mapOrderToEcommerceOrder({
      id: "order_secret",
      currency_code: "usd",
      total: 25,
      tax_total: 2,
      shipping_total: 5,
      discount_total: -1,
      item_subtotal: 19,
      items: [
        {
          id: "li_1",
          variant_id: "variant_1",
          title: "Shirt",
          quantity: 1,
          unit_price: 19,
        },
      ],
    } as never);
    expect(mapped.orderId).toBe(pseudonymizeOrderId("order_secret"));
    expect(mapped.revenue).toBe(25);
    expect(mapped.discount).toBe(1);
  });

  it("only tracks real cart mutations", () => {
    expect(shouldTrackCartMutation("add")).toBe(true);
    expect(shouldTrackCartMutation("hydrate")).toBe(false);
    expect(shouldTrackCartMutation("checkout")).toBe(false);
  });

  it("diffs cart lines for add/remove mutations", () => {
    const previous = {
      currency_code: "usd",
      items: [
        {
          id: "li_1",
          variant_id: "variant_1",
          title: "Shirt",
          quantity: 1,
          unit_price: 10,
          product: {
            collection: { title: "Acme" },
            categories: [{ name: "Shirts" }],
          },
        },
      ],
    };
    const next = {
      currency_code: "usd",
      items: [
        {
          id: "li_1",
          variant_id: "variant_1",
          title: "Shirt",
          quantity: 3,
          unit_price: 10,
          product: {
            collection: { title: "Acme" },
            categories: [{ name: "Shirts" }],
          },
        },
      ],
    };

    expect(diffCartEcommerceItems(previous as never, next as never, "add")).toEqual([
      {
        sku: "variant_1",
        name: "Shirt",
        category: "Shirts",
        brand: "Acme",
        price: 10,
        quantity: 2,
      },
    ]);
    expect(diffCartEcommerceItems(next as never, previous as never, "remove")).toEqual([
      {
        sku: "variant_1",
        name: "Shirt",
        category: "Shirts",
        brand: "Acme",
        price: 10,
        quantity: 2,
      },
    ]);
  });
});

describe("analytics bus", () => {
  it("fans out to registered providers only when consent is granted", async () => {
    const { clearProvidersForTests, emit, registerProvider, setAnalyticsConsentGranted } =
      await import("./bus");
    clearProvidersForTests();
    const seen: string[] = [];
    registerProvider({
      id: "test",
      isConfigured: () => true,
      track: (event) => {
        seen.push(event.name);
      },
    });
    emit({ name: "page_view", url: "/shop" });
    expect(seen).toEqual([]);
    setAnalyticsConsentGranted(true);
    emit({ name: "page_view", url: "/shop" });
    expect(seen).toEqual(["page_view"]);
    clearProvidersForTests();
  });
});

describe("dedupe", () => {
  it("dedupes purchase keys", () => {
    resetDedupeForTests();
    expect(oncePerKey("purchase:1")).toBe(true);
    expect(oncePerKey("purchase:1")).toBe(false);
  });
});

describe("submitPaymentSuccessOnce", () => {
  it("fires trackCustomEvent on first call when hasAnalytics is true", async () => {
    const { submitPaymentSuccessOnce, resetCheckoutAnalyticsForTests } = await import(
      "./checkout-analytics"
    );
    const { trackCustomEvent } = await import("./events");
    resetCheckoutAnalyticsForTests();

    const spy = vi.spyOn({ trackCustomEvent }, "trackCustomEvent");
    // We test via the module's own trackCustomEvent call indirectly — so stub the module
    const mockTrack = vi.fn();
    submitPaymentSuccessOnce("order_A", true, mockTrack);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("Checkout", "payment_success", "stripe");
    spy.mockRestore();
  });

  it("does NOT fire on second call with same orderId", async () => {
    const { submitPaymentSuccessOnce, resetCheckoutAnalyticsForTests } = await import(
      "./checkout-analytics"
    );
    resetCheckoutAnalyticsForTests();

    const mockTrack = vi.fn();
    submitPaymentSuccessOnce("order_B", true, mockTrack);
    submitPaymentSuccessOnce("order_B", true, mockTrack);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when hasAnalytics is false", async () => {
    const { submitPaymentSuccessOnce, resetCheckoutAnalyticsForTests } = await import(
      "./checkout-analytics"
    );
    resetCheckoutAnalyticsForTests();

    const mockTrack = vi.fn();
    submitPaymentSuccessOnce("order_C", false, mockTrack);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("fires for different orderIds independently", async () => {
    const { submitPaymentSuccessOnce, resetCheckoutAnalyticsForTests } = await import(
      "./checkout-analytics"
    );
    resetCheckoutAnalyticsForTests();

    const mockTrack = vi.fn();
    submitPaymentSuccessOnce("order_D1", true, mockTrack);
    submitPaymentSuccessOnce("order_D2", true, mockTrack);
    expect(mockTrack).toHaveBeenCalledTimes(2);
  });
});

describe("gtm consent mode", () => {
  it("pushes Consent Mode v2 default denied before tags", async () => {
    const previous = process.env.NEXT_PUBLIC_GTM_ID;
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST";
    const { ensureGtmConsentDefaults, resetGtmScriptForTests } = await import("./gtm");
    resetGtmScriptForTests();
    const layer: unknown[] = [];
    vi.stubGlobal("window", { dataLayer: layer });
    ensureGtmConsentDefaults();
    expect(layer[0]).toEqual([
      "consent",
      "default",
      expect.objectContaining({
        analytics_storage: "denied",
        ad_storage: "denied",
      }),
    ]);
    process.env.NEXT_PUBLIC_GTM_ID = previous;
    resetGtmScriptForTests();
    vi.unstubAllGlobals();
  });
});
