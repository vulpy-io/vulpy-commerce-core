import { describe, expect, it } from "vitest";
import { applyStructuredCategoryBreadcrumbLabels } from "./structured-breadcrumb";

describe("applyStructuredCategoryBreadcrumbLabels", () => {
  it("applies Payload H1 overrides for JSON-LD without changing visible labels", () => {
    const contentByHandle = new Map([
      [
        "kids",
        {
          h1: "Kids rackets",
        },
      ],
      [
        "rackets",
        {
          h1: "Rackets",
        },
      ],
    ]);

    expect(
      applyStructuredCategoryBreadcrumbLabels(
        [
          {
            label: "Rackets",
            href: "/categories/rackets",
            categoryHandle: "rackets",
          },
          { label: "Kids", categoryHandle: "kids" },
        ],
        contentByHandle
      )
    ).toEqual([
      {
        label: "Rackets",
        href: "/categories/rackets",
        categoryHandle: "rackets",
      },
      {
        label: "Kids",
        categoryHandle: "kids",
        structuredLabel: "Kids rackets",
      },
    ]);
  });

  it("leaves non-category breadcrumb items unchanged", () => {
    expect(
      applyStructuredCategoryBreadcrumbLabels(
        [{ label: "Medusa T-Shirt" }],
        new Map()
      )
    ).toEqual([{ label: "Medusa T-Shirt" }]);
  });
});
