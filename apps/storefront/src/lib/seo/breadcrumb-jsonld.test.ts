import { describe, expect, it } from "vitest";
import { buildBreadcrumbListJsonLd } from "./breadcrumb-jsonld";

describe("buildBreadcrumbListJsonLd", () => {
  it("builds a BreadcrumbList with home and linked ancestors", () => {
    expect(
      buildBreadcrumbListJsonLd([
        { label: "Accessories", href: "/categories/accessories" },
        { label: "Protectors", href: "/categories/protectors" },
        { label: "NOX Protector" },
      ])
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "http://localhost:3000/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Accessories",
          item: "http://localhost:3000/categories/accessories",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Protectors",
          item: "http://localhost:3000/categories/protectors",
        },
        {
          "@type": "ListItem",
          position: 4,
          name: "NOX Protector",
        },
      ],
    });
  });

  it("uses structuredLabel in JSON-LD when provided", () => {
    expect(
      buildBreadcrumbListJsonLd([
        {
          label: "Kids",
          structuredLabel: "Kids rackets",
          href: "/categories/kids",
        },
      ])
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "http://localhost:3000/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Kids rackets",
          item: "http://localhost:3000/categories/kids",
        },
      ],
    });
  });

  it("adds the current page URL to the last item when provided", () => {
    expect(
      buildBreadcrumbListJsonLd(
        [{ label: "NOX Protector" }],
        { currentPath: "/products/nox-protector" }
      )
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "http://localhost:3000/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "NOX Protector",
          item: "http://localhost:3000/products/nox-protector",
        },
      ],
    });
  });
});
