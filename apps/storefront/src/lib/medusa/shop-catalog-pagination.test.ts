import { describe, expect, it } from "vitest";
import { isDeepPageDedupeActive, shouldAppendNextPage } from "./shop-catalog-pagination";

describe("isDeepPageDedupeActive", () => {
  it("is inert when the hook never needs dedupe (page-1 landing)", () => {
    expect(
      isDeepPageDedupeActive({ isDedupeActive: false, isDeepLanding: false })
    ).toBe(false);
  });

  it("is active on a deep landing with dedupe armed", () => {
    expect(
      isDeepPageDedupeActive({ isDedupeActive: true, isDeepLanding: true })
    ).toBe(true);
  });

  it("stays active after the interceptor appends (deep scroll)", () => {
    expect(
      isDeepPageDedupeActive({
        isDedupeActive: true,
        isDeepLanding: true,
        hasAppended: true,
      })
    ).toBe(true);
  });

  it("is inactive when dedupe not armed", () => {
    expect(
      isDeepPageDedupeActive({ isDedupeActive: false, isDeepLanding: true })
    ).toBe(false);
  });
});

describe("shouldAppendNextPage", () => {
  it("always allows append when dedupe inactive", () => {
    expect(
      shouldAppendNextPage({ isDedupeActive: false, loadedPage: 1, totalPages: 1 })
    ).toBe(true);
  });

  it("allows append within range with deep landing", () => {
    expect(
      shouldAppendNextPage({ isDedupeActive: true, loadedPage: 2, totalPages: 4 })
    ).toBe(true);
  });

  it("stops at the last page", () => {
    expect(
      shouldAppendNextPage({ isDedupeActive: true, loadedPage: 4, totalPages: 4 })
    ).toBe(false);
  });
});