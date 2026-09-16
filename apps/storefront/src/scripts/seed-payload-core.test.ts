import { describe, expect, it } from "vitest";
import { stripPayloadManagedIds } from "./seed-payload-utils";

describe("stripPayloadManagedIds", () => {
  it("removes nested Payload-managed ids while preserving page content and slugs", () => {
    const input = {
      id: "page-id",
      slug: "home",
      blocks: [
        {
          id: "block-id",
          blockType: "hero",
          slides: [{ id: "slide-id", title: "Hello", image: { id: "media-id", url: "/hero.jpg" } }],
        },
      ],
    };

    expect(stripPayloadManagedIds(input)).toEqual({
      slug: "home",
      blocks: [
        {
          blockType: "hero",
          slides: [{ title: "Hello", image: { url: "/hero.jpg" } }],
        },
      ],
    });
  });
});
