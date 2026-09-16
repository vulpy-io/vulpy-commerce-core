import crypto from "node:crypto";
import config from "@payload-config";
import type { Payload } from "payload";
import { getPayload } from "payload";
import {
  defaultFooter,
  defaultHomeBlocks,
  defaultNavigation,
  defaultPages,
  defaultPaymentMethods,
  defaultPreFooterBlocks,
  defaultSiteSettings,
} from "@/lib/cms/defaults";
import {
  migrateLegacyPageSeo,
  replaceLegacyStorefrontBrand,
} from "@/lib/cms/legacy-brand";
import { PSEUDO_CATEGORY_SALE } from "@/lib/cms/pseudo-categories";
import { SHOP_SORT_VALUES } from "@/lib/medusa/shop-display";
import type { Page } from "../../payload-types";
import { seedEditorial } from "./seed-editorial";
import { ensureMedia, seedAllPublicImages } from "./seed-media";
import { stripPayloadManagedIds } from "./seed-payload-utils";

function logSeed(message: string) {
  console.log(`[payload-seed] ${message}`);
}

function generateSyncApiKey(): string {
  return crypto.randomBytes(24).toString("hex");
}

async function ensureMedusaSyncApiKey(
  payload: Payload,
  adminEmail: string,
  adminPassword: string
): Promise<string> {
  const existingAdmin = await payload.find({
    collection: "users",
    where: { email: { equals: adminEmail } },
    limit: 1,
    overrideAccess: true,
  });

  if (existingAdmin.docs.length) {
    const admin = existingAdmin.docs[0];
    const existingKey =
      admin.enableAPIKey && typeof admin.apiKey === "string" ? admin.apiKey.trim() : "";

    if (existingKey) {
      logSeed(`reuse Medusa sync API key for ${adminEmail}`);
      return existingKey;
    }

    const syncApiKey = generateSyncApiKey();
    await payload.update({
      collection: "users",
      id: admin.id,
      data: { enableAPIKey: true, apiKey: syncApiKey },
      overrideAccess: true,
    });
    logSeed(`enable Medusa sync API key for ${adminEmail}`);
    return syncApiKey;
  }

  const syncApiKey = generateSyncApiKey();
  await payload.create({
    collection: "users",
    data: {
      email: adminEmail,
      password: adminPassword,
      enableAPIKey: true,
      apiKey: syncApiKey,
    },
    overrideAccess: true,
  });
  logSeed(`create admin ${adminEmail} with Medusa sync API key`);
  return syncApiKey;
}

export { stripPayloadManagedIds } from "./seed-payload-utils";

async function ensureCollectionItem(
  payload: Payload,
  slug: string,
  items: Record<string, unknown>[],
  matchField: string
) {
  for (const item of items) {
    const key = item[matchField];
    const existing = await payload.find({
      collection: slug as never,
      where: { [matchField]: { equals: key } },
      limit: 1,
    });

    if (existing.docs.length) {
      logSeed(`skip ${slug} ${String(key)} (exists)`);
      continue;
    }

    const seedData = slug === "pages" ? stripPayloadManagedIds(item) : item;
    await payload.create({ collection: slug as never, data: seedData as never });
    logSeed(`create ${slug} ${String(key)}`);
  }
}

async function ensurePseudoCategoryContent(payload: Payload) {
  const existing = await payload.find({
    collection: "categoryContent" as never,
    where: { handle: { equals: PSEUDO_CATEGORY_SALE.handle } },
    limit: 1,
  });

  const identity = {
    kind: "pseudo",
    medusaCategoryId: PSEUDO_CATEGORY_SALE.medusaCategoryId,
    handle: PSEUDO_CATEGORY_SALE.handle,
    title: PSEUDO_CATEGORY_SALE.title,
    route: PSEUDO_CATEGORY_SALE.route,
    showCategoryFilter: PSEUDO_CATEGORY_SALE.showCategoryFilter,
  };

  if (!existing.docs.length) {
    await payload.create({
      collection: "categoryContent" as never,
      data: identity as never,
    });
    logSeed(`create categoryContent ${PSEUDO_CATEGORY_SALE.handle}`);
    return;
  }

  const doc = existing.docs[0] as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (doc.kind !== "pseudo") {
    patch.kind = "pseudo";
  }
  if (!doc.medusaCategoryId) {
    patch.medusaCategoryId = identity.medusaCategoryId;
  }
  if (!doc.route) {
    patch.route = identity.route;
  }
  if (doc.showCategoryFilter === undefined || doc.showCategoryFilter === null) {
    patch.showCategoryFilter = identity.showCategoryFilter;
  }

  if (!Object.keys(patch).length) {
    logSeed(`skip categoryContent ${PSEUDO_CATEGORY_SALE.handle} (exists)`);
    return;
  }

  await payload.update({
    collection: "categoryContent" as never,
    id: doc.id as string | number,
    data: patch as never,
  });
  logSeed(`patch categoryContent ${PSEUDO_CATEGORY_SALE.handle}`);
}

async function ensureSelectionCategoryContent(payload: Payload) {
  const handle = "demo-selection";
  const route = "/demo-selection";
  const existing = await payload.find({
    collection: "categoryContent" as never,
    where: { handle: { equals: handle } },
    limit: 1,
  });

  const identity = {
    kind: "selection",
    medusaCategoryId: "selection:demo-selection",
    handle,
    title: "Demo selection",
    route,
    filterQuery: "sale_only=true",
    showCategoryFilter: true,
  };

  if (!existing.docs.length) {
    await payload.create({
      collection: "categoryContent" as never,
      data: identity as never,
    });
    logSeed(`create categoryContent ${handle}`);
    return;
  }

  logSeed(`skip categoryContent ${handle} (exists)`);
}

async function ensureGlobal(
  payload: Payload,
  slug: string,
  isConfigured: (doc: Record<string, unknown>) => boolean,
  buildData: () => Promise<Record<string, unknown>>
) {
  const doc = (await payload.findGlobal({ slug: slug as never })) as Record<string, unknown>;

  if (isConfigured(doc)) {
    logSeed(`skip global ${slug} (already configured)`);
    return;
  }

  await payload.updateGlobal({
    slug: slug as never,
    data: (await buildData()) as never,
  });
  logSeed(`seed global ${slug}`);
}

async function migrateLegacySiteSettingsBrand(payload: Payload) {
  const current = (await payload.findGlobal({
    slug: "site-settings",
  })) as unknown as Record<string, unknown>;
  const brandingFields = {
    siteName: current.siteName,
    defaultSeo: current.defaultSeo,
    utilityPageSeo: current.utilityPageSeo,
  };
  const branded = replaceLegacyStorefrontBrand(brandingFields) as Record<
    string,
    unknown
  >;

  if (JSON.stringify(branded) === JSON.stringify(brandingFields)) {
    logSeed("skip site-settings legacy brand hotfix (already current)");
    return;
  }

  await payload.updateGlobal({
    slug: "site-settings",
    data: branded as never,
  });
  logSeed("patch site-settings legacy brand defaults");
}

/**
 * Backfill the real contact identity under the footer "Visit" block for DBs
 * seeded before the contact values existed (they carried empty strings).
 * Runs after ensureGlobal so existing, already-configured DBs still converge.
 */
async function backfillSiteSettingsContactInfo(payload: Payload) {
  const current = (await payload.findGlobal({
    slug: "site-settings",
  })) as unknown as { contactInfo?: Record<string, unknown> };

  const contact = current.contactInfo ?? {};
  const shouldWrite =
    !(contact.address && contact.email && contact.contactName) ||
    JSON.stringify(contact) ===
      JSON.stringify({ address: "", phone: "", email: "", contactName: "" });

  if (!shouldWrite) {
    logSeed("skip site-settings contact backfill (already populated)");
    return;
  }

  await payload.updateGlobal({
    slug: "site-settings",
    data: { contactInfo: defaultSiteSettings.contactInfo } as never,
  });
  logSeed("patch site-settings contact info (footer Visit block)");
}

/** Repair incomplete existing installs without replacing a custom logo. */
async function backfillSiteSettingsLogo(payload: Payload) {
  const current = (await payload.findGlobal({ slug: "site-settings" })) as unknown as {
    logo?: unknown;
  };

  if (current.logo) {
    logSeed("skip site-settings logo backfill (already configured)");
    return;
  }

  const logo = await ensureMedia(payload, defaultSiteSettings.logoUrl, "Site logo");
  if (!logo) {
    logSeed("skip site-settings logo backfill (bundled logo unavailable)");
    return;
  }

  await payload.updateGlobal({
    slug: "site-settings",
    data: { logo } as never,
  });
  logSeed("patch site-settings logo from bundled default");
}

async function backfillSiteSettingsTopBarLinks(payload: Payload) {
  const current = (await payload.findGlobal({ slug: "site-settings" })) as unknown as Record<string, unknown>;
  if (JSON.stringify(current.topBarLinks ?? []) === JSON.stringify(defaultSiteSettings.topBarLinks)) {
    logSeed("skip site-settings top bar links (already current)");
    return;
  }
  await payload.updateGlobal({ slug: "site-settings", data: { topBarText: defaultSiteSettings.topBarText, topBarLinks: defaultSiteSettings.topBarLinks } as never });
  logSeed("patch site-settings top bar links");
}

async function migrateLegacyPageSeoFields(payload: Payload) {
  const { docs } = await payload.find({
    collection: "pages",
    pagination: false,
    select: { seo: true },
    where: {
      or: [
        { "seo.title": { contains: "Medusa Store" } },
        { "seo.description": { contains: "Medusa Store" } },
        { "seo.title": { equals: "Vulpy Commerce | Medusa Commerce" } },
      ],
    },
  });

  let updated = 0;
  for (const page of docs as unknown as Record<string, unknown>[]) {
    const migration = migrateLegacyPageSeo(page);
    if (!migration.changed) {
      continue;
    }
    await payload.update({
      collection: "pages",
      id: page.id as string | number,
      data: { seo: migration.seo } as never,
    });
    updated += 1;
  }
  logSeed(
    updated
      ? `patch legacy SEO in ${updated} page(s)`
      : "skip pages legacy SEO hotfix (already current)"
  );
}

function mapBlocksForSeed(payload: Payload, blocks: Record<string, unknown>[]) {
  return Promise.all(
    blocks.map(async (block) => {
      const blockType = block.blockType as string;
      if (blockType === "hero") {
        return {
          ...block,
          slides: await Promise.all(
            ((block.slides as Record<string, unknown>[]) || []).map(async (slide) => ({
              ...slide,
              image: slide.imageUrl
                ? await ensureMedia(payload, slide.imageUrl as string, String(slide.title))
                : undefined,
            }))
          ),
          promos: await Promise.all(
            ((block.promos as Record<string, unknown>[]) || []).map(async (promo) => ({
              ...promo,
              image: promo.imageUrl
                ? await ensureMedia(payload, promo.imageUrl as string, String(promo.title))
                : undefined,
            }))
          ),
          badges: await Promise.all(
            ((block.badges as Record<string, unknown>[]) || []).map(async (badge) => ({
              ...badge,
              icon: badge.iconUrl
                ? await ensureMedia(payload, badge.iconUrl as string, String(badge.title))
                : undefined,
            }))
          ),
        };
      }

      if (blockType === "promoBanners") {
        return {
          ...block,
          banners: await Promise.all(
            ((block.banners as Record<string, unknown>[]) || []).map(async (banner) => ({
              ...banner,
              image: banner.imageUrl
                ? await ensureMedia(
                    payload,
                    banner.imageUrl as string,
                    String(banner.title || banner.eyebrow)
                  )
                : undefined,
            }))
          ),
        };
      }

      if (blockType === "countdownPromo") {
        return {
          ...block,
          image: block.imageUrl
            ? await ensureMedia(payload, block.imageUrl as string, "Countdown promo")
            : undefined,
        };
      }

      if (blockType === "newsletter") {
        return {
          ...block,
          bgImage: block.bgImageUrl
            ? await ensureMedia(payload, block.bgImageUrl as string, "Newsletter background")
            : undefined,
        };
      }

      if (blockType === "testimonials") {
        return {
          ...block,
          items: await Promise.all(
            ((block.items as Record<string, unknown>[]) || []).map(async (item) => ({
              ...item,
              avatar: item.avatarUrl
                ? await ensureMedia(payload, item.avatarUrl as string, String(item.authorName))
                : undefined,
            }))
          ),
        };
      }

      if (blockType === "cta") {
        return {
          ...block,
          image: block.imageUrl
            ? await ensureMedia(payload, block.imageUrl as string, String(block.title))
            : undefined,
        };
      }

      if (blockType === "media") {
        return {
          ...block,
          image: block.imageUrl
            ? await ensureMedia(payload, block.imageUrl as string, String(block.caption || "Media"))
            : undefined,
        };
      }

      if (blockType === "mediaWithText") {
        const imageId = block.imageUrl
          ? await ensureMedia(payload, block.imageUrl as string, String(block.title || "Media with text"))
          : undefined;
        return {
          ...block,
          // Payload's mediaWithText schema stores the image as a media upload
          // relation under `image` (string imageUrl is a UI-time helper).
          image: imageId,
          video: undefined,
        };
      }

      if (blockType === "banner") {
        return {
          ...block,
          image: block.imageUrl
            ? await ensureMedia(payload, block.imageUrl as string, String(block.title || "Banner"))
            : undefined,
        };
      }

      return block;
    })
  );
}

async function ensureHomeBlocks(payload: Payload) {
  const { docs } = await payload.find({
    collection: "pages",
    where: { slug: { equals: "home" } },
    limit: 1,
  });

  const home = docs[0] as Page | undefined;
  const existingBlocks = home?.blocks;

  if (Array.isArray(existingBlocks) && existingBlocks.length > 0) {
    logSeed("update home page blocks (always apply current defaults)");
  }

  const homeBlocks = await mapBlocksForSeed(
    payload,
    defaultHomeBlocks as Record<string, unknown>[]
  );

  if (!home) {
    await payload.create({
      collection: "pages",
      data: {
        title: "Home",
        slug: "home",
        layout: "generic",
        blocks: homeBlocks as Page["blocks"],
        seo: {
          title: defaultSiteSettings.defaultSeo.title,
          description: defaultSiteSettings.defaultSeo.description,
        },
      },
    });
    logSeed("create pages home");
    return;
  }

  await payload.update({
    collection: "pages",
    id: home.id as string | number,
    data: { blocks: homeBlocks as Page["blocks"] },
  });
  logSeed("seed home page blocks (was empty)");
}

export async function seedPayload(existing?: Payload): Promise<{ syncApiKey: string }> {
  const payload = existing ?? (await getPayload({ config }));

  await seedAllPublicImages(payload);

  const adminEmail = process.env.PAYLOAD_SEED_EMAIL || "admin@example.com";
  const adminPassword = process.env.PAYLOAD_SEED_PASSWORD || "supersecret";
  const syncApiKey = await ensureMedusaSyncApiKey(payload, adminEmail, adminPassword);

  await ensureGlobal(
    payload,
    "site-settings",
    (doc) => Boolean((doc.siteName as string | undefined)?.trim()),
    async () => ({
      siteName: defaultSiteSettings.siteName,
      logo: await ensureMedia(payload, defaultSiteSettings.logoUrl, "Site logo"),
      supportPhone: defaultSiteSettings.supportPhone,
      searchPlaceholder: defaultSiteSettings.searchPlaceholder,
      topBarText: defaultSiteSettings.topBarText,
      topBarLinks: defaultSiteSettings.topBarLinks,
      hideCart: defaultSiteSettings.hideCart,
      medusaCategoriesInNavigation: defaultSiteSettings.medusaCategoriesInNavigation,
      contactInfo: defaultSiteSettings.contactInfo,
      socialLinks: defaultSiteSettings.socialLinks,
      copyright: defaultSiteSettings.copyright,
      defaultSeo: defaultSiteSettings.defaultSeo,
      utilityPageSeo: defaultSiteSettings.utilityPageSeo,
      shopLabels: {
        breadcrumb: defaultSiteSettings.shopLabels.breadcrumb,
        sortOptions: SHOP_SORT_VALUES.map((value) => ({
          value,
          label: defaultSiteSettings.shopLabels.sortOptions[value] ?? value,
        })),
      },
      authLabels: defaultSiteSettings.authLabels,
      paymentMethods: await Promise.all(
        defaultPaymentMethods.map(async (method) => ({
          icon: await ensureMedia(payload, method.iconUrl, method.alt),
        }))
      ),
    })
  );
  await migrateLegacySiteSettingsBrand(payload);
  await backfillSiteSettingsContactInfo(payload);
  await backfillSiteSettingsLogo(payload);
  await backfillSiteSettingsTopBarLinks(payload);

  await ensureGlobal(
    payload,
    "navigation",
    (doc) => ((doc.items as unknown[] | undefined) ?? []).length > 0,
    async () => ({ items: defaultNavigation.items })
  );

  await ensureGlobal(
    payload,
    "footer",
    (doc) => {
      // preFooterBlocks (the newsletter) is always present via its field
      // default, so it can't be the ready signal — columns are. And converge
      // legacy/template state to the HF structure instead of treating it as
      // a configured custom footer: (a) any of those template column titles
      // means a pre-HF seed wrote it, or (b) a non-empty preFooterBlocks
      // means an old seed backfilled the sitewide newsletter that HF's
      // footer (preFooterBlocks: []) does not have.
      const columns = (doc.columns as { title?: string; links?: unknown[] }[] | undefined) ?? [];
      const legacySignature = columns.some(
        (column) =>
          column.title === "Account" ||
          column.title === "Quick Link" ||
          column.title === "Help & Support"
      );
      const preFooterBlocks = (doc.preFooterBlocks as unknown[] | undefined) ?? [];
      const companyLinks = columns.find((column) => column.title === "Company")?.links ?? [];
      const expectedCompanyLinks = defaultFooter.columns.find((column) => column.title === "Company")?.links ?? [];
      const hasCurrentCompanyLinks = JSON.stringify(companyLinks) === JSON.stringify(expectedCompanyLinks);
      const hasDeprecatedLinks = columns.some((column) =>
        (column.links ?? []).some((link: any) => link.label === "In the Press" || link.label === "FAQs")
      );
      const legalLinks = (doc.legalLinks as { label?: string }[] | undefined) ?? [];
      const hasDeprecatedLegalLinks = legalLinks.some((link) => link.label === "FAQs");
      return columns.length > 0 && !legacySignature && preFooterBlocks.length === 0 && hasCurrentCompanyLinks && !hasDeprecatedLinks && !hasDeprecatedLegalLinks;
    },
    async () => ({
      ...defaultFooter,
      preFooterBlocks: await mapBlocksForSeed(
        payload,
        defaultPreFooterBlocks as Record<string, unknown>[]
      ),
    })
  );

  // The homepage already carries its own newsletter block (HF parity); do not
  // backfill a sitewide footer newsletter — that would render it twice. The
  // footer global is configured by the block above from defaultFooter, which
  // has preFooterBlocks: [] to match HF's footer.
  logSeed("footer preFooterBlocks left empty (homepage newsletter is the single source)");

  const blogPosts = [
    {
      title: "Objects that refuse to sit down",
      slug: "objects-that-refuse-to-sit-down",
      excerpt: "A closer look at the materials, balance and quiet engineering behind the collection.",
      authorName: "Acme Inc.",
      publishedAt: new Date().toISOString(),
      views: 1200,
      _status: "published",
      featuredImage: await ensureMedia(payload, "/images/products/demo/paperweight-brass.jpg", "Objects that refuse to sit down"),
    },
    {
      title: "A small study in balance",
      slug: "a-small-study-in-balance",
      excerpt: "Why familiar forms become more interesting when the shelf disappears.",
      authorName: "Acme Inc.",
      publishedAt: new Date().toISOString(),
      views: 950,
      _status: "published",
      featuredImage: await ensureMedia(payload, "/images/products/demo/paperweight-chrome.jpg", "A small study in balance"),
    },
    {
      title: "The room between things",
      slug: "the-room-between-things",
      excerpt: "Three ways to give a room a little more air without adding more noise.",
      authorName: "Acme Inc.",
      publishedAt: new Date().toISOString(),
      views: 720,
      _status: "published",
      featuredImage: await ensureMedia(payload, "/images/products/demo/reflector-disc-brass.jpg", "The room between things"),
    },
  ];

  await ensureCollectionItem(payload, "posts", blogPosts, "slug");
  for (const post of blogPosts) {
    const existing = await payload.find({
      collection: "posts",
      where: { slug: { equals: post.slug } },
      limit: 1,
    });
    const doc = existing.docs[0] as { id?: string | number } | undefined;
    if (doc?.id) {
      await payload.update({ collection: "posts", id: doc.id, data: post as never });
    }
  }
  const seededPostSlugs = new Set(blogPosts.map((post) => post.slug));
  const existingPosts = await payload.find({ collection: "posts", limit: 100, pagination: false });
  for (const post of existingPosts.docs as Record<string, any>[]) {
    if (!seededPostSlugs.has(post.slug)) {
      try {
        await payload.delete({ collection: "posts", id: post.id });
        logSeed(`remove deprecated post ${String(post.slug)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const normalizedMessage = message.toLowerCase();
        const alreadyRemoved = normalizedMessage.includes("null") || normalizedMessage.includes("not found");
        if (!alreadyRemoved) {
          throw error;
        }
        logSeed(`skip deprecated post ${String(post.slug)} (already removed)`);
      }
    }
  }

  const pages = await Promise.all(
    Object.values(defaultPages).map(async (page) => ({
      title: page.title,
      slug: page.slug,
      layout: page.layout,
      blocks: await mapBlocksForSeed(payload, (page.blocks as Record<string, unknown>[]) || []),
      contactName: page.contactName,
      contactPhone: page.contactPhone,
      contactEmail: page.contactEmail,
      contactAddress: page.contactAddress,
      seo: page.seo,
      heroImage: page.heroImageUrl
        ? await ensureMedia(payload, page.heroImageUrl, page.title)
        : undefined,
    }))
  );

  await ensureCollectionItem(payload, "pages", pages, "slug");
  for (const slug of ["faq", "in-the-press"]) {
    const existing = await payload.find({ collection: "pages", where: { slug: { equals: slug } }, limit: 1 });
    const doc = existing.docs[0] as { id?: string | number } | undefined;
    if (doc?.id) {
      await payload.delete({ collection: "pages", id: doc.id });
      logSeed(`remove deprecated page ${slug}`);
    }
  }
  await ensureHomeBlocks(payload);
  await migrateLegacyPageSeoFields(payload);
  await ensurePseudoCategoryContent(payload);
  await ensureSelectionCategoryContent(payload);
  await seedEditorial(payload);

  return { syncApiKey };
}
