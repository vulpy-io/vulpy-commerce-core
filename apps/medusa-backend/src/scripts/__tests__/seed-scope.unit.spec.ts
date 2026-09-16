import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
  LEGACY_APPAREL_CATEGORY_NAMES,
  LEGACY_APPAREL_PRODUCT_HANDLES,
  LEGACY_APPAREL_TAG_NAMES,
} from "../cleanup-legacy-apparel";
import { getSeedPaymentProviders } from "../seed-helpers";

/**
 * Seed scope guards (Brief 12, A1).
 *
 * The default Medusa seed must stay MINIMAL-CORE ONLY: store, region, tax,
 * stock location, fulfillment, shipping options, sales-channel links and the
 * publishable API key. Legacy NextMerce apparel fixtures (t-shirt, sweatshirt,
 * … + their S3 imagery) live behind `SEED_LEGACY_APPAREL=1` in
 * `seed-apparel-fixtures.ts`, and the packaged demo catalog lives entirely in
 * `demo-catalog.ts` / `seed-demo-catalog.ts`.
 *
 * These specs read script sources so a future edit cannot silently drag the
 * apparel fixtures back into the default boot path.
 */

const SCRIPTS_DIR = join(import.meta.dirname, "..");
const SEED_TS = readFileSync(join(SCRIPTS_DIR, "seed.ts"), "utf8");

/** Distinctive legacy-apparel strings — must never appear in the default seed. */
const LEGACY_APPAREL_MARKERS = [
  "medusa-public-images.s3", // remote S3 tee/sweatshirt/shorts shots
  '"t-shirt"',
  '"sweatshirt"',
  '"sweatpants"',
  '"shorts"',
  "priced-tee-range",
  "priced-tee-sale",
  "priced-tee-simple",
];

describe("minimal-core seed scope", () => {
  describe("seed payment providers", () => {
    it("seeds only the system provider when Stripe keys are absent", () => {
      expect(getSeedPaymentProviders(undefined)).toEqual(["pp_system_default"]);
    });

    it("seeds Stripe and the system provider for matching Stripe keys", () => {
      expect(
        getSeedPaymentProviders("«redacted:sk_test_…»")
      ).toEqual(["pp_stripe_stripe", "pp_system_default"]);
    });
  });

  it.each(LEGACY_APPAREL_MARKERS)(
    "keeps %s out of the default seed.ts",
    (marker) => {
      expect(SEED_TS).not.toContain(marker);
    }
  );

  it("still wires the SEED_LEGACY_APPAREL escape hatch", () => {
    expect(SEED_TS).toContain('process.env.SEED_LEGACY_APPAREL === "1"');
    expect(SEED_TS).toContain("seedLegacyApparelFixtures");
  });

  it("cleans known legacy fixtures only in the default branch", () => {
    expect(SEED_TS).toContain("cleanupLegacyApparel");
    expect(SEED_TS).toContain('process.env.SEED_LEGACY_APPAREL === "1"');
    expect(LEGACY_APPAREL_PRODUCT_HANDLES).toEqual([
      "t-shirt", "sweatshirt", "sweatpants", "shorts",
      "priced-tee-range", "priced-tee-sale", "priced-tee-simple",
    ]);
    expect(LEGACY_APPAREL_CATEGORY_NAMES).toEqual([
      "Apparel", "Merch", "Shirts", "Sweatshirts", "Pants", "Tees",
    ]);
    expect(LEGACY_APPAREL_TAG_NAMES).toEqual(["New", "Bestseller"]);
    expect(LEGACY_APPAREL_PRODUCT_HANDLES).not.toContain("checkout-e2e-product" as never);
  });

  it("documents the minimal intent in a comment", () => {
    expect(SEED_TS.toLowerCase()).toContain("minimal");
  });

  it("extracts the apparel fixtures into their own gated module", () => {
    const fixturesPath = join(
      SCRIPTS_DIR,
      "seed-apparel-fixtures.ts"
    );
    expect(existsSync(fixturesPath)).toBe(true);
    const fixturesTs = readFileSync(fixturesPath, "utf8");
    expect(fixturesTs).toContain("export async function seedLegacyApparelFixtures");
    // The moved block owns the S3 imagery and the apparel handles.
    expect(fixturesTs).toContain("medusa-public-images.s3");
    expect(fixturesTs).toContain('"t-shirt"');
  });

  it("runs legacy cleanup only on the default path", () => {
    expect(SEED_TS).toContain("cleanupLegacyApparel(productModuleService, logger)");
    expect(SEED_TS).toContain('process.env.SEED_LEGACY_APPAREL === "1"');
    expect(SEED_TS).toContain("} else {");
  });

  it("preserves the checkout E2E fixture in the cleanup module", () => {
    const cleanupTs = readFileSync(join(SCRIPTS_DIR, "cleanup-legacy-apparel.ts"), "utf8");
    expect(cleanupTs).toContain('"checkout-e2e-product"');
    for (const marker of LEGACY_APPAREL_MARKERS.slice(1)) {
      expect(cleanupTs).toContain(marker.replaceAll('"', ""));
    }
  });
  it("exposes a seed:minimal npm alias", () => {
    const pkg = JSON.parse(
      readFileSync(join(SCRIPTS_DIR, "..", "..", "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["seed:minimal"]).toBeDefined();
  });
});
