import { describe, expect, it } from "vitest";
import { formatSeoTitle } from "./format-seo-title";

describe("formatSeoTitle", () => {
  it("appends site name to the title", () => {
    expect(formatSeoTitle("Rackets", "Vulpy Commerce")).toBe("Rackets | Vulpy Commerce");
  });

  it("does not duplicate an existing site name suffix", () => {
    expect(formatSeoTitle("Rackets | Vulpy Commerce", "Vulpy Commerce")).toBe(
      "Rackets | Vulpy Commerce"
    );
  });

  it("returns the site name unchanged when it is already the whole title", () => {
    expect(formatSeoTitle("Vulpy Commerce", "Vulpy Commerce")).toBe("Vulpy Commerce");
  });

  it("returns site name when title is empty", () => {
    expect(formatSeoTitle("", "Vulpy Commerce")).toBe("Vulpy Commerce");
  });
});
