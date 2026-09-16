import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Storefront de-brand guards (Brief 12, B).
 *
 * The storefront is a Vulpy product surface — upstream template brands
 * (upstream template brands) must not ship in user-visible copy, storage keys,
 * or docs. These specs grep the tracked source so a regression fails fast.
 */

const SF_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const src = (p: string) => readFileSync(join(SF_ROOT, p), "utf8");

function gitTrackedFiles(ext: string): string[] {
  try {
    const out = execSync(`git ls-files '${ext}'`, {
      cwd: join(SF_ROOT, "apps", "storefront"),
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

describe("storefront de-brand", () => {
  it("keeps upstream template names out of runtime seed copy and fallback chrome", () => {
    const defaults = src("apps/storefront/src/lib/cms/defaults.ts");
    const fallback = src("apps/storefront/src/lib/cms/fallback.ts");
    const legacyBrand = ["pim", "jo", "labs"].join("");
    expect(defaults.toLowerCase()).not.toContain(legacyBrand);
    expect(fallback.toLowerCase()).not.toContain(legacyBrand);
  });

  it("renames localStorage keys away from the template namespace", () => {
    const wishlist = src(
      "apps/storefront/src/components/Wishlist/WishlistHydrator.tsx",
    );
    const legacyWishlistKey = ["next", "merce-wishlist"].join("");
    expect(wishlist).not.toContain(legacyWishlistKey);
    expect(wishlist).toContain('"vulpy-wishlist"');

    const recent = src(
      "apps/storefront/src/components/RecentlyViewed/RecentlyViewedHydrator.tsx",
    );
    const legacyRecentKey = ["next", "merce-recently-viewed"].join("");
    expect(recent).not.toContain(legacyRecentKey);
    expect(recent).toContain('"vulpy-recently-viewed"');
  });

  it("has no upstream template storage namespace in tracked client/runtime code", () => {
    for (const file of gitTrackedFiles("src/**/*.ts")) {
      let content: string;
      try {
        content = src(join("apps/storefront", file));
      } catch {
        // Deleted-from-disk files linger in the git index until staging;
        // a missing file carries no brand markers.
        continue;
      }
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
        continue;
      }
      expect(
        content.includes(["next", "merce-"].join("")),
        `${file} carries the legacy localStorage namespace`,
      ).toBe(false);
    }
  });

  it("deletes the unregistered Marketing collection module", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    expect(
      fs.existsSync(join(SF_ROOT, "src/collections/Marketing.ts")),
    ).toBe(false);
  });

  it("payload config does not reference Marketing collections", () => {
    const config = src("apps/storefront/payload.config.ts");
    expect(config).not.toContain("./src/collections/Marketing");
    const configTypes = src("apps/storefront/payload-types.ts");
    expect(configTypes).not.toContain("hero-slides");
  });

  it("fallback marker list detects the current Vulpy seed title", () => {
    const fallback = src("apps/storefront/src/lib/cms/fallback.ts");
    expect(fallback).toContain('"Vulpy Commerce | Medusa Commerce"');
  });
});
