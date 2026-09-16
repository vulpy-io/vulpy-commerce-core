import type { ShopSortValue } from "@/lib/medusa/shop-display";
import type { Menu } from "@/types/Menu";

export type CmsLink = {
  label: string;
  url: string;
  newTab?: boolean;
};

export type CmsNavItem = Menu;

export type MedusaCategoriesNavPlacement = "before" | "after" | "hide";

export type CmsPaymentMethod = {
  iconUrl: string;
  alt: string;
};

export type CmsSiteSettings = {
  siteName: string;
  logoUrl: string;
  checkoutLogoUrl?: string;
  supportPhone: string;
  searchPlaceholder: string;
  topBarText?: string;
  topBarLinks?: { label: string; url: string }[];
  hideCart: boolean;
  medusaCategoriesInNavigation: MedusaCategoriesNavPlacement;
  contactInfo: {
    address: string;
    phone: string;
    email: string;
    contactName: string;
  };
  socialLinks: { platform: string; url: string }[];
  copyright: string;
  defaultSeo: { title: string; description: string };
  utilityPageSeo: {
    route: string;
    title: string;
    description: string;
    heading?: string;
    subheading?: string;
  }[];
  shopLabels: {
    breadcrumb: string;
    sortOptions: Partial<Record<ShopSortValue, string>>;
  };
  authLabels: {
    signInTitle: string;
    signInSubtitle: string;
    signUpTitle: string;
    signUpSubtitle: string;
  };
  paymentMethods: CmsPaymentMethod[];
  /** Shop-wide Google Product Offer shipping/return — omit JSON-LD fields when empty. */
  merchantListing?: {
    returnDays?: number | null;
    returnFees?: string | null;
    returnMethod?: string | null;
    returnCountry?: string | null;
    shippingRate?: number | null;
    shippingCurrency?: string | null;
    deliveryTimeMinDays?: number | null;
    deliveryTimeMaxDays?: number | null;
    shippingDestinationCountry?: string | null;
  };
  /** Physical showroom for LocalBusiness JSON-LD on the homepage only. */
  showroom?: {
    enabled: boolean;
    name?: string | null;
    type?: "Store" | "SportingGoodsStore" | null;
    streetAddress?: string | null;
    addressLocality?: string | null;
    addressRegion?: string | null;
    postalCode?: string | null;
    addressCountry?: string | null;
    telephone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    openingHours?: string | null;
  };
};

export type CmsFooter = {
  preFooterBlocks: CmsBlock[];
  helpTitle: string;
  columns: { title: string; links: CmsLink[] }[];
  legalLinks: CmsLink[];
};

export type CmsHeroSlide = {
  id: string;
  /** Optional editorial kicker shown on full-bleed hero slides. */
  eyebrow: string;
  title: string;
  discountValue: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl: string;
};

export type CmsHeroPromo = {
  id: string;
  title: string;
  priceLabel: string;
  offerText: string;
  ctaLabel: string;
  link: string;
  imageUrl: string;
};

export type CmsPromoBanner = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl: string;
};

export type CmsTrustBadge = {
  id: string;
  title: string;
  description: string;
  iconUrl: string;
};

export type CmsTestimonial = {
  id: string;
  quote: string;
  authorName: string;
  authorRole: string;
  avatarUrl: string;
};

export type CmsBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: unknown;
  featuredImageUrl: string;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
  views: number;
  categories: string[];
  tags: string[];
};

export type CmsPage = {
  slug: string;
  title: string;
  layout: string;
  content: unknown;
  blocks?: CmsBlock[];
  livePreviewData?: Record<string, unknown>;
  heroImageUrl: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  seo: { title: string; description: string };
};

export type CmsBlock =
  | {
      blockType: "hero";
      slides: CmsHeroSlide[];
      promos: CmsHeroPromo[];
      badges: CmsTrustBadge[];
    }
  | {
      blockType: "categoryGrid";
      eyebrow: string;
      title: string;
      limit: number;
      categoryHandles?: { handle: string }[];
    }
  | {
      blockType: "productGrid";
      title: string;
      eyebrow: string;
      subtitle: string;
      ctaLabel: string;
      ctaUrl: string;
      variant: string;
      limit: number;
    }
  | { blockType: "promoBanners"; banners: CmsPromoBanner[] }
  | { blockType: "contactForm"; title: string; subtitle: string }
  | {
      blockType: "countdownPromo";
      eyebrow: string;
      title: string;
      body: string;
      productName: string;
      deadline: string;
      ctaLabel: string;
      ctaUrl: string;
      imageUrl: string;
    }
  | {
      blockType: "testimonials";
      eyebrow: string;
      title: string;
      items: CmsTestimonial[];
    }
  | {
      blockType: "newsletter";
      title: string;
      subtitle: string;
      placeholder: string;
      bgImageUrl: string;
    }
  | { blockType: "richText"; content: unknown }
  | {
      blockType: "contactInfo";
      contactName: string;
      contactPhone: string;
      contactEmail: string;
      contactAddress: string;
    }
  | {
      blockType: "cta";
      title: string;
      body: string;
      theme: "blue" | "teal" | "dark";
      imageUrl: string;
      links: CmsLink[];
    }
  | {
      blockType: "faq";
      title: string;
      items: { question: string; answer: string }[];
    }
  | {
      blockType: "media";
      caption: string;
      imageUrl: string;
    }
  | {
      blockType: "banner";
      eyebrow: string;
      title: string;
      body: string;
      ctaLabel: string;
      ctaUrl: string;
      imageUrl: string;
    }
  | {
      blockType: "mediaWithText";
      title: string;
      content: unknown;
      ctaLabel: string;
      ctaUrl: string;
      mediaType: "image" | "upload" | "youtube" | "vimeo";
      imageUrl: string;
      videoUrl: string;
      embedUrl: string;
      autoplay: boolean;
      mediaPosition: "left" | "right";
      swapOnMobile: boolean;
    }
  | {
      blockType: "spacer";
      size: number;
    };

export type CmsProductContent = {
  medusaProductId: string;
  handle: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  blocks: CmsBlock[];
  livePreviewData?: Record<string, unknown>;
  seo: { title: string; description: string };
};

export type CmsCategoryContent = {
  medusaCategoryId: string;
  handle: string;
  title: string;
  kind: "medusa" | "pseudo" | "selection";
  route?: string;
  filterQuery?: string;
  h1: string;
  hideSubcategoryThumbs: boolean;
  hideProductListing: boolean;
  showCategoryFilter: boolean;
  blocksAboveSubcategories: CmsBlock[];
  blocksBelowSubcategories: CmsBlock[];
  blocksBelowListing: CmsBlock[];
  livePreviewData?: Record<string, unknown>;
  seo: { title: string; description: string };
};
