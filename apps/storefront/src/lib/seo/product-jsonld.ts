import type { CmsSiteSettings } from "@/lib/cms/types";
import type { ProductDetail } from "@/types/product-detail";
import { toAbsoluteUrl } from "./site-url";

export type MerchantListingSettings = NonNullable<
  CmsSiteSettings["merchantListing"]
>;

function buildShippingDetails(merchant?: MerchantListingSettings | null) {
  if (!merchant) {
    return undefined;
  }
  const rate = merchant.shippingRate;
  const currency = (merchant.shippingCurrency || "").trim();
  const dest = (merchant.shippingDestinationCountry || "").trim();
  const minDays = merchant.deliveryTimeMinDays;
  const maxDays = merchant.deliveryTimeMaxDays;
  if (
    rate == null ||
    !currency ||
    !dest ||
    minDays == null ||
    maxDays == null
  ) {
    return undefined;
  }
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: String(rate),
      currency: currency.toUpperCase(),
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: dest.toUpperCase(),
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: 0,
        maxValue: 1,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: minDays,
        maxValue: maxDays,
        unitCode: "DAY",
      },
    },
  };
}

function buildReturnPolicy(merchant?: MerchantListingSettings | null) {
  if (!merchant) {
    return undefined;
  }
  const days = merchant.returnDays;
  const country = (merchant.returnCountry || "").trim();
  if (days == null || !country) {
    return undefined;
  }
  const fees = (merchant.returnFees || "").trim().toLowerCase();
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: country.toUpperCase(),
    returnPolicyCategory:
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: days,
    returnMethod: merchant.returnMethod
      ? `https://schema.org/${merchant.returnMethod.replace(/\s+/g, "")}`
      : "https://schema.org/ReturnByMail",
    returnFees:
      fees === "free" || fees === "0"
        ? "https://schema.org/FreeReturn"
        : "https://schema.org/ReturnShippingFees",
  };
}

export function buildProductJsonLd(
  product: ProductDetail,
  path: string,
  options?: {
    currencyCode?: string;
    merchantListing?: MerchantListingSettings | null;
  }
) {
  const prices = product.variants
    .map((variant) => variant.discountedPrice || variant.price)
    .filter((price) => typeof price === "number" && price > 0);
  const lowPrice = prices.length ? Math.min(...prices) : undefined;
  const highPrice = prices.length ? Math.max(...prices) : undefined;
  const currency = (options?.currencyCode || "usd").toUpperCase();
  const inStock = product.variants.some((variant) => variant.inStock !== false);
  const images = product.images.length
    ? product.images.map((image) => toAbsoluteUrl(image))
    : undefined;
  const brandName = product.attributes?.find(
    (attr) => attr.label?.toLowerCase() === "brand"
  )?.value;
  const sku = product.variants[0]?.sku || product.variants[0]?.id;
  const shippingDetails = buildShippingDetails(options?.merchantListing);
  const returnPolicy = buildReturnPolicy(options?.merchantListing);

  const baseOffer = {
    url: toAbsoluteUrl(path),
    priceCurrency: currency,
    availability: inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    ...(shippingDetails ? { shippingDetails } : {}),
    ...(returnPolicy ? { hasMerchantReturnPolicy: returnPolicy } : {}),
  };

  const offers =
    lowPrice !== undefined && highPrice !== undefined && lowPrice !== highPrice
      ? {
          "@type": "AggregateOffer",
          ...baseOffer,
          lowPrice: String(lowPrice),
          highPrice: String(highPrice),
        }
      : {
          "@type": "Offer",
          ...baseOffer,
          price: String(lowPrice ?? product.variants[0]?.price ?? 0),
        };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || undefined,
    image: images,
    sku: sku || undefined,
    brand: brandName ? { "@type": "Brand", name: brandName } : undefined,
    offers,
  };
}
