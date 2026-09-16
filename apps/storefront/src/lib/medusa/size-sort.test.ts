import { describe, expect, it } from "vitest";
import { expandSizeForFilter, expandSizesForFilter, sortSizeValues } from "./size-sort";

describe("sortSizeValues", () => {
  it("sorts standard letter sizes", () => {
    expect(sortSizeValues(["L", "XS", "M", "S", "XL", "XXL"])).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
    ]);
  });

  it("sorts extended XL sizes and aliases", () => {
    expect(sortSizeValues(["6XL", "4XL", "XXXL", "2XL", "XXL", "5XL", "3XL"])).toEqual([
      "XXL",
      "2XL",
      "3XL",
      "XXXL",
      "4XL",
      "5XL",
      "6XL",
    ]);
  });

  it("places slash compound sizes between their components", () => {
    expect(
      sortSizeValues([
        "XL",
        "XXL",
        "2XL/3XL",
        "L/XL",
        "S/M",
        "XS",
        "S",
        "M",
        "L",
      ])
    ).toEqual([
      "XS",
      "S",
      "S/M",
      "M",
      "L",
      "L/XL",
      "XL",
      "XXL",
      "2XL/3XL",
    ]);
  });

  it("places hyphen compound sizes between their components", () => {
    expect(sortSizeValues(["M", "M-L", "L", "XS-S", "XS", "S"])).toEqual([
      "XS",
      "XS-S",
      "S",
      "M",
      "M-L",
      "L",
    ]);
  });

  it("sorts additional compound variants in full apparel order", () => {
    expect(
      sortSizeValues([
        "4XL",
        "3XL/4XL",
        "XL/XXL",
        "XXS/XS",
        "XS/S",
        "M/L",
        "XXS",
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "XXL",
        "3XL",
      ])
    ).toEqual([
      "XXS",
      "XXS/XS",
      "XS",
      "XS/S",
      "S",
      "M",
      "M/L",
      "L",
      "XL",
      "XL/XXL",
      "XXL",
      "3XL",
      "3XL/4XL",
      "4XL",
    ]);
  });

  it("sorts numeric sizes numerically", () => {
    expect(sortSizeValues(["42", "38", "40"])).toEqual(["38", "40", "42"]);
  });

  it("keeps one-size variants at the end", () => {
    expect(sortSizeValues(["M", "One Size", "S", "OS"])).toEqual([
      "S",
      "M",
      "One Size",
      "OS",
    ]);
  });
});

describe("expandSizeForFilter", () => {
  it("expands numeric hyphen and slash ranges", () => {
    expect(expandSizeForFilter("39-43")).toEqual(["39", "40", "41", "42", "43"]);
    expect(expandSizeForFilter("39/43")).toEqual(["39", "40", "41", "42", "43"]);
    expect(expandSizeForFilter("39–43")).toEqual(["39", "40", "41", "42", "43"]);
  });

  it("expands letter compounds inclusively", () => {
    expect(expandSizeForFilter("XS/S")).toEqual(["XS", "S"]);
    expect(expandSizeForFilter("M/L")).toEqual(["M", "L"]);
    expect(expandSizeForFilter("S-L")).toEqual(["S", "M", "L"]);
  });

  it("treats three-plus parts as an explicit list", () => {
    expect(expandSizeForFilter("S/M/L").sort()).toEqual(["L", "M", "S"]);
  });

  it("passes through singles and one-size", () => {
    expect(expandSizeForFilter("40")).toEqual(["40"]);
    expect(expandSizeForFilter("OS")).toEqual(["ONE SIZE"]);
  });

  it("unions expansions for facet building", () => {
    expect(expandSizesForFilter(["39-43", "40"]).sort((a, b) => Number(a) - Number(b))).toEqual([
      "39",
      "40",
      "41",
      "42",
      "43",
    ]);
  });
});
