import { create, insertMultiple, search } from "@orama/orama";
import {
  extractProductModelFromMetadata,
  productSearchSchema,
  toIndexedProductDocument,
} from "../../productSearch";

describe("productSearch", () => {
  it("extracts model from product metadata attributes", () => {
    const model = extractProductModelFromMetadata({
      attributes: [
        { label: "Code", value: "123" },
        { label: "Model", value: "Pro V2" },
      ],
    });

    expect(model).toBe("Pro V2");
  });

  it("indexes model text for full-text search", async () => {
    const db = create({ schema: productSearchSchema });
    await insertMultiple(db, [
      toIndexedProductDocument({
        id: "prod_1",
        title: "Medusa Racket",
        handle: "medusa-racket",
        description: "Carbon frame",
        thumbnail: "/static/racket.jpg",
        metadata: {
          attributes: [{ label: "Model", value: "RS-100" }],
        },
        categories: [{ id: "cat_1", name: "Rackets" }],
        variants: [{ sku: "SKU-1" }],
      }),
      toIndexedProductDocument({
        id: "prod_2",
        title: "Medusa Bag",
        handle: "medusa-bag",
        description: "Large bag",
        thumbnail: "/static/bag.jpg",
        metadata: {
          attributes: [{ label: "Model", value: "BG-200" }],
        },
        categories: [{ id: "cat_2", name: "Bags" }],
        variants: [{ sku: "SKU-2" }],
      }),
    ]);

    const results = await search(db, {
      term: "RS-100",
      limit: 10,
      offset: 0,
    });

    expect(results.hits).toHaveLength(1);
    expect(results.hits[0]?.document.id).toBe("prod_1");
  });
});
