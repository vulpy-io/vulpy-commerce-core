import { describe, expect, it } from "vitest";
import {
  CMS_SEED_MARKERS,
  cmsDefaultsAllowed,
  htmlContainsCmsSeedMarker,
} from "./fallback";

describe("cmsDefaultsAllowed", () => {
  it("allows defaults outside production by default", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.CMS_ALLOW_DEFAULTS;
    process.env.NODE_ENV = "development";
    process.env.CMS_ALLOW_DEFAULTS = undefined;
    expect(cmsDefaultsAllowed()).toBe(true);
    process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) {
      process.env.CMS_ALLOW_DEFAULTS = undefined;
    } else {
      process.env.CMS_ALLOW_DEFAULTS = prevAllow;
    }
  });

  it("denies defaults in production unless overridden", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.CMS_ALLOW_DEFAULTS;
    process.env.NODE_ENV = "production";
    process.env.CMS_ALLOW_DEFAULTS = undefined;
    expect(cmsDefaultsAllowed()).toBe(false);
    process.env.CMS_ALLOW_DEFAULTS = "1";
    expect(cmsDefaultsAllowed()).toBe(true);
    process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) {
      process.env.CMS_ALLOW_DEFAULTS = undefined;
    } else {
      process.env.CMS_ALLOW_DEFAULTS = prevAllow;
    }
  });
});

describe("htmlContainsCmsSeedMarker", () => {
  it("detects distinctive seed nav/brand strings", () => {
    expect(htmlContainsCmsSeedMarker("hello James Septimus world")).toBe(
      "James Septimus",
    );
    expect(htmlContainsCmsSeedMarker("clean page")).toBeNull();
    expect(CMS_SEED_MARKERS.length).toBeGreaterThan(3);
  });

  it("detects legacy and interim seed titles but not the legitimate product name", () => {
    expect(htmlContainsCmsSeedMarker("Medusa Store | Medusa Commerce")).toBe(
      "Medusa Store | Medusa Commerce"
    );
    expect(htmlContainsCmsSeedMarker("Vulpy Commerce | Medusa Commerce")).toBe(
      "Vulpy Commerce | Medusa Commerce"
    );
    expect(htmlContainsCmsSeedMarker("Vulpy Commerce")).toBeNull();
  });
});
