import { describe, expect, it } from "vitest";
import {
  defaultHeroPromos,
  defaultHomeBlocks,
  defaultHomepage,
  defaultNavigation,
  defaultPages,
  defaultPaymentMethods,
  defaultPreFooterBlocks,
  defaultPromoBanners,
  defaultSiteSettings,
  defaultSocialLinks,
  defaultTrustBadges,
} from "./defaults";

const LEGACY_ELECTRONICS_REGEX = /iPhone|treadmill|Apple Watch/i;
const LEVITATION_REGEX = /levitat/i;
const PROMO_IMAGE_REGEX = /^\/images\/promo\/promo-0[123]\.png$/;
const COUNTDOWN_IMAGE_REGEX = /^\/images\/countdown\/countdown-01\.png$/;
const TIKTOK_URL_REGEX = /tiktok\.com/;
const PINTEREST_URL_REGEX = /pinterest\.com/;
const GRAVITY_JOKE_REGEX = /gravity joke/;
const BUILT_BY_HAND_REGEX = /Built by hand/;
const HOVER_REGEX = /hover/;
const FUTURE_DATE = Date.now();

describe("defaultHomeBlocks (Hector Finch reference flow)", () => {
  it("registers the HF-parity 6-block flow: hero, categoryGrid, new-arrivals, story richText, mediaWithText care-guide, newsletter", () => {
    const blockTypes = defaultHomeBlocks.map((block) => block.blockType);
    expect(blockTypes).toEqual([
      "hero",
      "categoryGrid",
      "productGrid",
      "richText",
      "mediaWithText",
      "newsletter",
    ]);
  });

  it("no bare template blocks: promo banners, countdown, testimonials, best-sellers gone", () => {
    expect(
      defaultHomeBlocks.some((block) => block.blockType === "promoBanners")
    ).toBe(false);
    expect(
      defaultHomeBlocks.some((block) => block.blockType === "countdownPromo")
    ).toBe(false);
    expect(
      defaultHomeBlocks.some((block) => block.blockType === "testimonials")
    ).toBe(false);
    expect(
      defaultHomeBlocks.some(
        (block) =>
          block.blockType === "productGrid" && block.variant === "best-sellers"
      )
    ).toBe(false);
  });

  it("hero carries no promos or trust badges (editorial fullbleed flow)", () => {
    const hero = defaultHomeBlocks.find(
      (block): block is Extract<typeof block, { blockType: "hero" }> =>
        block.blockType === "hero"
    );
    expect(hero?.promos).toEqual([]);
    expect(hero?.badges).toEqual([]);
  });

  it("keeps the reusable promo and badge type exports available", () => {
    // The arrays are still exported and populated — only the home hero uses
    // empty arrays, so a future page can re-use them.
    expect(defaultHeroPromos.length).toBeGreaterThan(0);
    expect(defaultTrustBadges.length).toBeGreaterThan(0);
  });

  it("new-arrivals grid links to the latest sort", () => {
    const newArrivals = defaultHomeBlocks.find(
      (block) =>
        block.blockType === "productGrid" && block.variant === "new-arrivals"
    );

    expect(newArrivals && "ctaUrl" in newArrivals ? newArrivals.ctaUrl : "").toBe(
      "/shop?sort=latest"
    );
  });

  it("story richText uses the levitation 'built by hand' copy", () => {
    const story = defaultHomeBlocks.find(
      (block) => block.blockType === "richText"
    );
    expect(story).toBeDefined();
    const json = JSON.stringify(story);
    expect(json).toMatch(BUILT_BY_HAND_REGEX);
    expect(json).toMatch(HOVER_REGEX);
  });

  it("mediaWithText care-guide block links to /care-guide", () => {
    const care = defaultHomeBlocks.find(
      (block): block is Extract<typeof block, { blockType: "mediaWithText" }> =>
        block.blockType === "mediaWithText"
    );
    expect(care?.ctaLabel).toBe("Read the care guide");
    expect(care?.ctaUrl).toBe("/care-guide");
  });
});

describe("defaultPromoBanners — Vulpy levitation voice", () => {
  it("has exactly three banners with no legacy consumer-electronics copy", () => {
    expect(defaultPromoBanners).toHaveLength(3);
    const copy = JSON.stringify(defaultPromoBanners);
    expect(copy).not.toMatch(LEGACY_ELECTRONICS_REGEX);
    expect(copy).toMatch(LEVITATION_REGEX);
  });

  it("references existing promo images", () => {
    for (const banner of defaultPromoBanners) {
      expect(banner.imageUrl).toMatch(PROMO_IMAGE_REGEX);
    }
  });
});

describe("countdownPromo — Vulpy copy", () => {
  it("uses levitation copy and a future deadline", () => {
    expect(defaultHomepage.countdownPromo.title).toBe(
      "Objects that refuse to sit down"
    );
    expect(defaultHomepage.countdownPromo.body).toMatch(LEVITATION_REGEX);
    expect(Date.parse(defaultHomepage.countdownPromo.deadline)).toBeGreaterThan(
      FUTURE_DATE
    );
    expect(defaultHomepage.countdownPromo.imageUrl).toMatch(
      COUNTDOWN_IMAGE_REGEX
    );
  });
});

describe("defaultSocialLinks", () => {
  it("drops linkedin and includes tiktok + pinterest, keeping facebook/twitter/instagram", () => {
    const platforms = defaultSocialLinks.map((link) => link.platform);
    expect(platforms).toEqual([
      "facebook",
      "twitter",
      "instagram",
      "tiktok",
      "pinterest",
    ]);
    expect(platforms).not.toContain("linkedin");
    expect(defaultSocialLinks.find((l) => l.platform === "tiktok")?.url).toMatch(
      TIKTOK_URL_REGEX
    );
    expect(defaultSocialLinks.find((l) => l.platform === "pinterest")?.url).toMatch(
      PINTEREST_URL_REGEX
    );
  });
});

describe("defaultPaymentMethods", () => {
  it("has exactly 4 icons: Visa (payment-01), no PayPal (payment-02)", () => {
    expect(defaultPaymentMethods).toHaveLength(4);
    const urls = defaultPaymentMethods.map((method) => method.iconUrl);
    expect(urls).toEqual([
      "/images/payment/payment-01.svg",
      "/images/payment/payment-03.svg",
      "/images/payment/payment-04.svg",
      "/images/payment/payment-05.svg",
    ]);
    expect(urls).not.toContain("/images/payment/payment-02.svg");
  });
});

describe("defaultPreFooterBlocks — HF parity (footer has no sitewide newsletter)", () => {
  it("is empty so the homepage newsletter is the single source", () => {
    expect(defaultPreFooterBlocks).toHaveLength(0);
  });
});

describe("HF-parity curation + contact hygiene", () => {
  it("categoryGrid curates the demo catalog handles", () => {
    const grid = defaultHomeBlocks.find(
      (block): block is Extract<(typeof defaultHomeBlocks)[number], { blockType: "categoryGrid" }> =>
        block.blockType === "categoryGrid"
    );
    expect(grid?.categoryHandles?.map((entry) => entry.handle)).toEqual([
      "levitating-objects",
      "orbits-orbs",
      "timepieces",
    ]);
  });

  it("homepage newsletter uses the lean no-bg variant", () => {
    expect(defaultHomepage.newsletter.bgImageUrl).toBe("");
  });

  it("default navigation removes press links", () => {
    expect(defaultNavigation.items.map((item) => item.title)).toEqual([
      "Sale",
      "Latest",
      "Our Story",
      "Contact",
    ]);
  });

  it("carries clearly-fake placeholder contact values (no real identity)", () => {
    expect(defaultSiteSettings.contactInfo).toEqual({
      address: "123 Example Street, Springfield, ZZ 99999",
      phone: "",
      email: "hello@example.com",
      contactName: "",
    });
    expect(defaultSiteSettings.supportPhone).toBe("");
  });

  it("defaults the top bar tagline to the seed voice", () => {
    expect(defaultSiteSettings.topBarText).toBe(
      "Small-batch objects, delivered worldwide",
    );
  });

  it("defaults the final ordered top bar links", () => {
    expect(defaultSiteSettings.topBarLinks).toEqual([
      { label: "Blog", url: "/blog" },
      { label: "Contact", url: "/contact" },
    ]);
  });

  it("seeds featured Our Story and placeholder legal pages without FAQ or press content", () => {
    expect(defaultPages["our-story"]?.blocks.map((block) => block.blockType)).toEqual([
      "hero",
      "mediaWithText",
      "richText",
      "cta",
    ]);
    expect(defaultPages.faq).toBeUndefined();
    expect(defaultPages["in-the-press"]).toBeUndefined();
    expect(JSON.stringify(defaultPages.terms)).toContain("Acme Inc.");
    expect(JSON.stringify(defaultPages["privacy-policy"])).toContain("Acme Inc.");
  });
});