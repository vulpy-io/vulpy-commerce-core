import { describe, expect, it } from "vitest";
import {
  demoteDescriptionHeadings,
  looksLikeHtml,
  sanitizeProductDescriptionHtml,
} from "./sanitize-product-description";

describe("sanitizeProductDescriptionHtml", () => {
  it("demotes headings and strips scripts", () => {
    const html = sanitizeProductDescriptionHtml(
      '<H1>Title</H1><P onclick="x">Safe</P><script>alert(1)</script>'
    );
    expect(html).toContain("<p><strong>Title</strong></p>");
    expect(html).toContain("<p>Safe</p>");
    expect(html.toLowerCase()).not.toContain("script");
    expect(html.toLowerCase()).not.toContain("onclick");
  });

  it("detects html-ish strings", () => {
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
    expect(looksLikeHtml("plain text")).toBe(false);
  });

  it("demotes h2 independently", () => {
    expect(demoteDescriptionHeadings("<h2>Section</h2>")).toBe(
      "<p><strong>Section</strong></p>"
    );
  });

  it("strips javascript: urls and event handlers", () => {
    const html = sanitizeProductDescriptionHtml(
      '<a href="javascript:alert(1)">link</a><img src=x onerror=alert(2)>'
    );
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toContain("onerror");
  });

  it("strips disallowed tags while keeping allowed ones", () => {
    const html = sanitizeProductDescriptionHtml(
      '<ul><li><b>bold</b></li></ul><video src="x"></video>'
    );
    expect(html).toContain("<ul><li><b>bold</b></li></ul>");
    expect(html.toLowerCase()).not.toContain("video");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeProductDescriptionHtml("")).toBe("");
  });
});
