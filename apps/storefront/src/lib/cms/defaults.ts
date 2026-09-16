import { lexicalFromParagraphs } from "./lexical";
import type {
  CmsBlock,
  CmsFooter,
  CmsHeroPromo,
  CmsHeroSlide,
  CmsNavItem,
  CmsPage,
  CmsPromoBanner,
  CmsSiteSettings,
  CmsTestimonial,
  CmsTrustBadge,
} from "./types";

/**
 * Seed CMS copy for local empty-DB bootstraps only.
 * Production must not serve these on Payload failures — see `fallback.ts`.
 */
export const defaultNavigation: { items: CmsNavItem[] } = {
  items: [
    { id: 1, title: "Sale", newTab: false, path: "/sale" },
    { id: 2, title: "Latest", newTab: false, path: "/shop?sort=latest" },
    { id: 3, title: "Our Story", newTab: false, path: "/our-story" },
    { id: 4, title: "Contact", newTab: false, path: "/contact" }
  ],
};

export const defaultSocialLinks = [
  { platform: "facebook", url: "https://www.facebook.com/yourpage" },
  { platform: "twitter", url: "https://x.com/yourhandle" },
  { platform: "instagram", url: "https://www.instagram.com/yourhandle" },
  { platform: "tiktok", url: "https://www.tiktok.com/@yourhandle" },
  { platform: "pinterest", url: "https://www.pinterest.com/yourhandle" },
];

export const defaultPaymentMethods = [
  { iconUrl: "/images/payment/payment-01.svg", alt: "Payment method" },
  { iconUrl: "/images/payment/payment-03.svg", alt: "Payment method" },
  { iconUrl: "/images/payment/payment-04.svg", alt: "Payment method" },
  { iconUrl: "/images/payment/payment-05.svg", alt: "Payment method" },
];

export const defaultSiteSettings: CmsSiteSettings = {
  siteName: "Vulpy Commerce",
  logoUrl: "/images/logo/logo.svg",
  checkoutLogoUrl: "",
  supportPhone: "",
  searchPlaceholder: "Search products...",
  topBarText: "Small-batch objects, delivered worldwide",
  topBarLinks: [
    { label: "Blog", url: "/blog" },
    { label: "Contact", url: "/contact" },
  ],
  hideCart: false,
  medusaCategoriesInNavigation: "before",
  contactInfo: {
    address: "123 Example Street, Springfield, ZZ 99999",
    phone: "",
    email: "hello@example.com",
    contactName: "",
  },
  socialLinks: defaultSocialLinks,
  copyright: "Vulpy Commerce",
  defaultSeo: {
    title: "Vulpy Commerce",
    description: "Next.js storefront powered by Medusa",
  },
  utilityPageSeo: [
    { route: "/cart", title: "Cart | Vulpy Commerce", description: "Your shopping cart" },
    { route: "/checkout", title: "Checkout | Vulpy Commerce", description: "Complete your order" },
    { route: "/signin", title: "Sign in | Vulpy Commerce", description: "Sign in to your account", heading: "Sign in to your account", subheading: "Enter your details below" },
    { route: "/signup", title: "Register | Vulpy Commerce", description: "Create an account", heading: "Create an account", subheading: "Enter your details below" },
    { route: "/wishlist", title: "Wishlist | Vulpy Commerce", description: "Your saved products" },
    { route: "/recently-viewed", title: "Recently viewed | Vulpy Commerce", description: "Products you recently viewed" },
    { route: "/shop", title: "Shop | Vulpy Commerce", description: "Browse our catalog" },
    { route: "/my-account", title: "My account | Vulpy Commerce", description: "Manage your account" },
    { route: "/order/confirmed", title: "Order confirmed | Vulpy Commerce", description: "Thank you for your order", heading: "Thank you for your order!", subheading: "Continue shopping" },
    { route: "/blog", title: "Blog | Vulpy Commerce", description: "News and articles" },
  ],
  shopLabels: {
    breadcrumb: "All products",
    sortOptions: {
      latest: "New arrivals",
      oldest: "Oldest",
      bestsellers: "Bestsellers",
      "price-asc": "Price: low to high",
      "price-desc": "Price: high to low",
      "name-asc": "Name: A–Z",
      "name-desc": "Name: Z–A",
    },
  },
  authLabels: {
    signInTitle: "Sign in to your account",
    signInSubtitle: "Enter your details below",
    signUpTitle: "Create an account",
    signUpSubtitle: "Enter your details below",
  },
  merchantListing: {},
  showroom: { enabled: false },
  paymentMethods: defaultPaymentMethods,
};

export const defaultPreFooterBlocks: CmsBlock[] = [];

export const defaultFooter: CmsFooter = {
  preFooterBlocks: defaultPreFooterBlocks,
  helpTitle: "Visit",
  columns: [
    {
      title: "Shop",
      links: [
        { label: "Levitating Objects", url: "/categories/levitating-objects" },
        { label: "Paperweights", url: "/categories/paperweights" },
        { label: "Vessels", url: "/categories/vessels" },
        { label: "Instruments", url: "/categories/instruments" },
        { label: "Reflectors", url: "/categories/reflectors" },
        { label: "Timepieces", url: "/categories/timepieces" },
        { label: "Orbits & Orbs", url: "/categories/orbits-orbs" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Our Story", url: "/our-story" },
        { label: "New Arrivals", url: "/shop?sort=latest" },
        { label: "Contact", url: "/contact" },
      ],
    },
  ],
  legalLinks: [
    { label: "Privacy Policy", url: "/privacy-policy" },
    { label: "Terms and Conditions", url: "/terms" },
  ],
};

export const defaultHomepage = {
  sections: {
    categories: { enabled: true, eyebrow: "THE COLLECTION", title: "Shop by Category" },
    newArrivals: {
      enabled: true,
      eyebrow: "THIS WEEK'S",
      title: "New Arrivals",
      ctaLabel: "View all",
      ctaUrl: "/shop?sort=latest",
    },
    bestSellers: {
      enabled: true,
      title: "Best Sellers",
      subtitle: "Top products from our catalog",
    },
    testimonials: { enabled: true, eyebrow: "TESTIMONIALS", title: "User Feedbacks" },
  },
  countdownPromo: {
    enabled: true,
    eyebrow: "Don't Miss!!",
    title: "Objects that refuse to sit down",
    body: "The countdown is on for this season's levitating objects — pieces that hover so your desk doesn't have to.",
    productName: "Levitating Objects",
    deadline: "2026-12-31",
    ctaLabel: "Check it Out!",
    ctaUrl: "/shop",
    imageUrl: "/images/countdown/countdown-01.png",
  },
  newsletter: {
    enabled: true,
    title: "Stay in the loop on new levitations",
    subtitle:
      "New pieces, studio drops and the occasional gravity joke — straight to your inbox.",
    placeholder: "Enter your email",
    bgImageUrl: "",
  },
};

export const defaultHeroSlides: CmsHeroSlide[] = [
  {
    id: "1",
    eyebrow: "The Collection",
    title: "Objects that refuse to sit down",
    discountValue: "",
    body: "Everyday things, lightly defying gravity. Sculptural levitations of the studio, delivered to your desk.",
    ctaLabel: "Shop Levitating Objects",
    ctaUrl: "/shop",
    imageUrl: "/images/products/demo/metronome-brass.jpg",
  },
  {
    id: "2",
    eyebrow: "Entry-level pieces",
    title: "The first unsteady circuit",
    discountValue: "",
    body: "Small spheres and modest orbs for first-time collectors of the impossible.",
    ctaLabel: "Shop Orbits & Orbs",
    ctaUrl: "/shop",
    imageUrl: "/images/products/demo/orbit-glass-orb.jpg",
  },
  {
    id: "3",
    eyebrow: "Timepieces",
    title: "Time, briefly interrupted",
    discountValue: "",
    body: "Clocks and hourglasses that keep excellent time and decline to be mounted.",
    ctaLabel: "Shop Timepieces",
    ctaUrl: "/shop",
    imageUrl: "/images/products/demo/suspended-hourglass.jpg",
  },
];

export const defaultHeroPromos: CmsHeroPromo[] = [
  {
    id: "1",
    title: "Paperweights, unweighted",
    priceLabel: "From $18",
    offerText: "brass · chrome · copper",
    ctaLabel: "Shop Now",
    link: "/shop",
    imageUrl: "/images/products/demo/paperweight-brass.jpg",
  },
  {
    id: "2",
    title: "The first unsteady circuit",
    priceLabel: "From $14",
    offerText: "entry-level orbs",
    ctaLabel: "Shop Now",
    link: "/shop",
    imageUrl: "/images/products/demo/orbit-ring-stone.jpg",
  },
];

export const defaultPromoBanners: CmsPromoBanner[] = [
  {
    id: "1",
    eyebrow: "Paperweights, unweighted",
    title: "Up to 30% off",
    subtitle:
      "Brass, chrome and copper pieces that stopped being heavy. Desk anchors with ambition.",
    ctaLabel: "Shop Now",
    ctaUrl: "/shop",
    imageUrl: "/images/promo/promo-01.png",
  },
  {
    id: "2",
    eyebrow: "Orbits & orbs",
    title: "Entry-level levitation",
    subtitle:
      "Small spheres and modest orbs for first-time collectors of the impossible.",
    ctaLabel: "Shop Now",
    ctaUrl: "/shop",
    imageUrl: "/images/promo/promo-02.png",
  },
  {
    id: "3",
    eyebrow: "Timepieces",
    title: "Timepieces that refuse the wall",
    subtitle:
      "Clocks and hourglasses that keep excellent time and decline to be mounted.",
    ctaLabel: "Shop Now",
    ctaUrl: "/shop",
    imageUrl: "/images/promo/promo-03.png",
  },
];

export const defaultTrustBadges: CmsTrustBadge[] = [
  {
    id: "1",
    title: "Free Shipping",
    description: "For all orders $200",
    iconUrl: "/images/icons/icon-01.svg",
  },
  {
    id: "2",
    title: "1 & 1 Returns",
    description: "Cancellation after 1 day",
    iconUrl: "/images/icons/icon-02.svg",
  },
  {
    id: "3",
    title: "100% Secure Payments",
    description: "Guarantee secure payments",
    iconUrl: "/images/icons/icon-03.svg",
  },
  {
    id: "4",
    title: "24/7 Dedicated Support",
    description: "Anywhere & anytime",
    iconUrl: "/images/icons/icon-04.svg",
  },
];

export const defaultTestimonials: CmsTestimonial[] = [
  {
    id: "1",
    quote:
      "Lorem ipsum dolor sit amet, adipiscing elit. Donec malesuada justo vitae augue suscipit beautiful vehicula",
    authorName: "Davis Dorwart",
    authorRole: "Serial Entrepreneur",
    avatarUrl: "/images/users/user-01.jpg",
  },
  {
    id: "2",
    quote:
      "Lorem ipsum dolor sit amet, adipiscing elit. Donec malesuada justo vitae augue suscipit beautiful vehicula",
    authorName: "Wilson Dias",
    authorRole: "Backend Developer",
    avatarUrl: "/images/users/user-02.jpg",
  },
];

export const defaultHomeBlocks: CmsBlock[] = [
  {
    blockType: "hero",
    slides: defaultHeroSlides,
    promos: [],
    badges: [],
  },
  {
    blockType: "categoryGrid",
    eyebrow: "THE COLLECTION",
    title: "Shop by Category",
    limit: 12,
    categoryHandles: [
      { handle: "levitating-objects" },
      { handle: "orbits-orbs" },
      { handle: "timepieces" },
    ],
  },
  {
    blockType: "productGrid",
    title: "New Arrivals",
    eyebrow: "THIS WEEK'S",
    subtitle: "",
    ctaLabel: "View all",
    ctaUrl: "/shop?sort=latest",
    variant: "new-arrivals",
    limit: 12,
  },
  {
    blockType: "richText",
    content: lexicalFromParagraphs([
      "Built by hand. Designed to hover.",
      "We compose each levitating object in small batches, balancing natural variation — a brass seam, a copper bloom — with a clear, architectural form. Nothing here is pressed out at scale; every piece earns its place on your desk the slow way.",
    ]),
  },
  {
    blockType: "mediaWithText",
    title: "Low maintenance, not no maintenance.",
    content: lexicalFromParagraphs([
      "A levitating object asks for very little: a flat surface, a shelf out of the sun, the occasional dust. Give one a quiet corner and it will sit there, mid-air, doing exactly what it promised.",
    ]),
    ctaLabel: "Read the care guide",
    ctaUrl: "/care-guide",
    mediaType: "image",
    imageUrl: "/images/products/demo/suspended-hourglass.jpg",
    videoUrl: "",
    embedUrl: "",
    autoplay: false,
    mediaPosition: "right",
    swapOnMobile: true,
  },
  {
    blockType: "newsletter",
    title: defaultHomepage.newsletter.title,
    subtitle: defaultHomepage.newsletter.subtitle,
    placeholder: defaultHomepage.newsletter.placeholder,
    bgImageUrl: defaultHomepage.newsletter.bgImageUrl,
  },
];

export const defaultPages: Record<string, CmsPage> = {
  home: {
    slug: "home",
    title: "Home",
    layout: "generic",
    content: null,
    blocks: defaultHomeBlocks,
    heroImageUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: {
      title: defaultSiteSettings.defaultSeo.title,
      description: defaultSiteSettings.defaultSeo.description,
    },
  },
  contact: {
    slug: "contact",
    title: "Contact",
    layout: "contact",
    content: null,
    blocks: [
      {
        blockType: "contactInfo",
        contactName: defaultSiteSettings.contactInfo.contactName,
        contactPhone: defaultSiteSettings.contactInfo.phone,
        contactEmail: defaultSiteSettings.contactInfo.email,
        contactAddress: defaultSiteSettings.contactInfo.address,
      },
      {
        blockType: "contactForm",
        title: "Send us a message",
        subtitle:
          "Questions about products, shipping, or an order? We'll get back to you as soon as we can.",
      },
    ],
    heroImageUrl: "",
    contactName: defaultSiteSettings.contactInfo.contactName,
    contactPhone: defaultSiteSettings.contactInfo.phone,
    contactEmail: defaultSiteSettings.contactInfo.email,
    contactAddress: defaultSiteSettings.contactInfo.address,
    seo: { title: "Contact | Vulpy Commerce", description: "Contact us" },
  },
  "404": {
    slug: "404",
    title: "Sorry, the page can't be found",
    layout: "error",
    content: null,
    blocks: [
      {
        blockType: "cta",
        title: "Sorry, the page can't be found",
        body: "The page you were looking for appears to have been moved, deleted or does not exist.",
        theme: "blue",
        imageUrl: "",
        links: [{ label: "Back to Home", url: "/" }],
      },
    ],
    heroImageUrl: "/images/404.svg",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: { title: "404 | Vulpy Commerce", description: "Page not found" },
  },
  "mail-success": {
    slug: "mail-success",
    title: "Successful!",
    layout: "mail-success",
    content: null,
    blocks: [
      {
        blockType: "cta",
        title: "Your message sent successfully",
        body: "Thank you so much for your message. We check e-mail frequently and will try our best to respond to your inquiry.",
        theme: "teal",
        imageUrl: "",
        links: [{ label: "Back to Home", url: "/" }],
      },
    ],
    heroImageUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: { title: "Message sent | Vulpy Commerce", description: "Your message has been sent" },
  },
  "privacy-policy": {
    slug: "privacy-policy",
    title: "Privacy policy",
    layout: "generic",
    content: lexicalFromParagraphs([
      "Acme Inc. operates this demo shop. This privacy notice describes how Acme Inc. may process personal data when you browse, create an account, place an order, or contact us. It is placeholder copy — replace controller identity, contact details, and retention periods with counsel-reviewed text before production traffic.",
      "Controller contact: set the legal entity name, postal address, and privacy email in site settings and this page before go-live. A counsel review of this notice, the cookie policy, and any data processing agreement with analytics hosting is a launch gate.",
      "Commerce data: Medusa stores orders, cart cookies, customer accounts, and payment provider outcomes as necessary to fulfil contracts and run the shop. We do not treat self-hosting analytics as a consent exemption.",
      "Analytics: only after you opt in, first-party Matomo cookies (_pk_*) measure page journeys, product and cart behaviour, checkout steps, and pseudonymised purchase attribution. We do not send email, name, address, raw customer or order IDs, JWTs, or unrestricted query strings to Matomo.",
      "Operational reporting: aggregate sales totals (orders placed, paid, cancelled, refunded, fulfilled, units, revenue components) are derived from Medusa records without browser identifiers, Matomo cookies, or cross-session visitor profiles.",
      "Your choices: use Cookie settings in the footer to accept, reject, or withdraw analytics, preference storage, and external media. Global Privacy Control is treated as a denial of optional purposes.",
      "Storage inventory: necessary — _medusa_* session/cart/auth cookies, Stripe checkout fields, and the _vulpy_consent cookie; preferences (optional) — wishlist and recently-viewed localStorage; analytics (optional) — Matomo _pk_* cookies; external media (optional) — YouTube/Vimeo embeds.",
    ]),
    blocks: [],
    heroImageUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: {
      title: "Privacy policy | Vulpy Commerce",
      description: "How we process personal data, analytics consent, and shop cookies",
    },
  },
  "cookie-policy": {
    slug: "cookie-policy",
    title: "Cookie policy",
    layout: "generic",
    content: lexicalFromParagraphs([
      "This cookie policy explains the storage technologies used on this shop. Update controller details and obtain counsel review before production launch.",
      "Necessary storage: Medusa cart and authentication cookies (_medusa_*), Stripe payment fields during checkout, and our consent record cookie (_vulpy_consent). These are required to operate the storefront and are disclosed as necessary.",
      "Preferences (optional): localStorage keys for wishlist and recently viewed products. Written only after you allow Preferences in Cookie settings.",
      "Analytics (optional): Matomo first-party cookies (_pk_*) load only after analytics consent. They support pageviews, search, ecommerce funnels, and pseudonymised order attribution. Rejecting or withdrawing consent stops Matomo requests and deletes those cookies.",
      "External media (optional): YouTube and Vimeo embeds from CMS blocks load only after External media consent.",
      "We do not use cookieless tracking to bypass consent, and we do not geolocate visitors to skip the banner. Global Privacy Control is treated as rejection of optional cookies.",
      "Manage or withdraw choices anytime via Cookie settings in the footer, or clear site data in your browser.",
    ]),
    blocks: [],
    heroImageUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: {
      title: "Cookie policy | Vulpy Commerce",
      description: "Cookie and local storage inventory for this shop",
    },
  },
  terms: {
    slug: "terms",
    title: "Terms and Conditions",
    layout: "generic",
    content: lexicalFromParagraphs([
      "Acme Inc. provides this demo storefront for evaluation. By using the site, you agree to use it lawfully and to provide accurate information when placing an order.",
      "Products, prices, availability, delivery estimates and promotional copy are illustrative and may change. Orders are subject to acceptance and payment authorization. Acme Inc. may correct errors, cancel unavailable orders, and contact you about an order.",
      "This placeholder text is not legal advice. Replace it with counsel-reviewed terms, governing law, returns, warranty, limitation of liability, and contact details before production use.",
    ]),
    blocks: [],
    heroImageUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: { title: "Terms and Conditions | Acme Inc.", description: "Placeholder terms and conditions for the Acme Inc. demo shop" },
  },
  "our-story": {
    slug: "our-story",
    title: "Our Story",
    layout: "generic",
    content: null,
    blocks: [
      {
        blockType: "hero",
        slides: defaultHeroSlides.slice(0, 1),
        promos: [],
        badges: [],
      },
      {
        blockType: "mediaWithText",
        title: "A small studio with a long view",
        content: lexicalFromParagraphs(["Acme Inc. makes considered objects in small batches, with honest materials and a little room for wonder."]),
        ctaLabel: "Meet the studio",
        ctaUrl: "/our-story",
        mediaType: "image",
        imageUrl: "/images/products/demo/suspended-hourglass.jpg",
        videoUrl: "",
        embedUrl: "",
        autoplay: false,
        mediaPosition: "right",
        swapOnMobile: true,
      },
      {
        blockType: "richText",
        content: lexicalFromParagraphs([
          "Objects that refuse to sit down.",
          "We make everyday things that hover — sculptural levitations of the ordinary, composed in small batches and balanced by hand. A brass seam, a copper bloom, a piece that earns its place on your desk the slow way.",
          "Everything here is designed in-house, finished in small runs, and tested against a simple standard: it should look as good floating as it does on the shelf.",
        ]),
      },
      {
        blockType: "cta",
        title: "Find your object",
        body: "Browse the collection and find something that earns its place in the room.",
        theme: "blue",
        imageUrl: "",
        links: [{ label: "Shop the collection", url: "/shop" }],
      },
    ],
    heroImageUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    seo: {
      title: "Our Story | Vulpy Commerce",
      description: "The studio behind objects that refuse to sit down",
    },
  },
};
