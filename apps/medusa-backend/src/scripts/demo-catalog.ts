/**
 * Demo catalog — "Levitating Philosophical Objects" (Task 9).
 *
 * Fake products that showcase the Pro feature set (finish swatches,
 * per-variant images, out-of-stock-clickable gallery, editorial register
 * landing, quote persona). Every record is stamped with
 * `metadata.demo_catalog = true` so a core-version strip can find and remove
 * them without touching baseline seed data (see `strip-demo-catalog.ts`).
 *
 * Image assets live in the storefront at `public/images/products/demo/`;
 * per-variant thumbnails point at that stable path and fall back to
 * `/images/products/placeholder.svg` when a file has not been generated yet.
 * Every referenced file is a real committed asset (spec enforces on-disk
 * existence so phantom references fail CI).
 *
 * Catalog shape (Brief 12, A2 — plan D-B): six families, 16 products,
 * 24 SKUs — every referenced file is a real generated shot. Capability demos
 * preserved: multi-variant finish swatches with per-variant imagery
 * (paperweight, keys, discs, bracket clock), out-of-stock-but-clickable
 * variant (paperweight Black), long-form HTML description (hourglass),
 * quotation persona hero (question mark), and one sale-priced entry piece
 * (glass orb) via `salePrice` price list.
 */
import type {
  CreateProductWorkflowInputDTO,
  ExecArgs,
  IProductModuleService,
  Logger,
} from "@medusajs/framework/types";
import { ProductStatus } from "@medusajs/framework/utils";

/** Metadata stamp marking every demo-catalog record. */
export const DEMO_CATALOG_METADATA_KEY = "demo_catalog" as const;

/** Marker value stored on demo products/categories/option values. */
export const DEMO_CATALOG_MARKER = true as const;

/** Stable path prefix for demo product imagery inside the storefront public dir. */
export const DEMO_IMAGE_DIR = "/images/products/demo" as const;

/** Storefront-shipped placeholder — always present, never fabricated. */
export const DEMO_FALLBACK_IMAGE = "/images/products/placeholder.svg" as const;

interface DemoProduct {
  handle: string;
  title: string;
  subtitle: string;
  description: string;
  categoryHandle: string;
  /** Long HTML body for the PDP description tab (`metadata.full_description`). */
  fullDescriptionHtml?: string;
  attributes?: { label: string; value: string }[];
  /**
   * Explicit filterable attributes for the shop sidebar facets
   * (`metadata.filterable`). Storefront synthesis also derives a Material
   * facet from descriptive `attributes`, but a product-level override here
   * wins and keeps the facet surface deterministic for the demo.
   */
  filterable?: Record<string, string>;
  options: { title: string; values: string[] }[];
  variants: {
    title: string;
    sku: string;
    options: Record<string, string>;
    price: number;
    /** Out-of-stock demo variant (manage_inventory + empty kit). */
    outOfStock?: boolean;
    /** Per-variant image under DEMO_IMAGE_DIR (placeholder until generated). */
    imageFile?: string;
  }[];
  /**
   * Sale price applied to every variant of this product through an active
   * `sale`-type price list (demo strikethrough / % off badge). Omit for
   * regularly-priced products.
   */
  salePrice?: number;
}

export const DEMO_PARENT_CATEGORY = {
  handle: "levitating-objects",
  name: "Levitating Objects",
  description:
    "A register of objects that refuse to sit down — sculptural levitations of the everyday, held aloft by nothing in particular.",
  imageFile: "category-levitating-objects.jpg",
} as const;

export const DEMO_TOP_LEVEL_CATEGORIES = [
  {
    handle: "orbits-orbs",
    name: "Orbits & Orbs",
    description: "Entry-level levitations — small spheres on their first unsteady circuits.",
    imageFile: "orbit-ring-stone.jpg",
  },
] as const;

export const DEMO_CHILD_CATEGORIES = [
  {
    handle: "paperweights",
    name: "Paperweights",
    description:
      "Stones that gave up gravity. They keep nothing in place but look excellent doing it.",
    imageFile: "paperweight-brass.jpg",
  },
  {
    handle: "vessels",
    name: "Vessels",
    description:
      "Cups, goblets and other containers for beverages you cannot currently pour.",
    imageFile: "hovering-cup.jpg",
  },
  {
    handle: "instruments",
    name: "Instruments",
    description:
      "Hourglasses, keys and question marks — tools for time, access and doubt.",
    imageFile: "hanging-compass.jpg",
  },
  {
    handle: "reflectors",
    name: "Reflectors",
    description:
      "Mirrors and polished discs that hang where reflections like to linger.",
    imageFile: "reflector-disc-brass.jpg",
  },
  {
    handle: "timepieces",
    name: "Timepieces",
    description:
      "Clocks, pendulums and other patient machinery suspended mid-tick.",
    imageFile: "suspended-hourglass.jpg",
  },
] as const;

/**
 * 3rd-level demo categories — grandchildren under `paperweights` so the
 * storefront nav renders three levels: Levitating Objects → Paperweights →
 * Desk/Cabinet Paperweights. Each needs products or `categoryHasProducts`
 * hides it; the paperweight product is linked into both below.
 */
export const DEMO_GRANDCHILD_CATEGORIES = [
  {
    parentHandle: "paperweights",
    handle: "desk-paperweights",
    name: "Desk Paperweights",
    description:
      "Paperweights sized for a desk that has already given up on being tidy.",
    imageFile: "category-desk-paperweights.jpg",
  },
  {
    parentHandle: "paperweights",
    handle: "cabinet-paperweights",
    name: "Cabinet Paperweights",
    description:
      "Paperweights for the cabinet that keeps the papers the desk refused.",
    imageFile: "category-cabinet-paperweights.jpg",
  },
] as const;

/**
 * Extra demo categories to attach to existing products (products may belong
 * to multiple categories). Used to give the 3rd-level demo grandchildren
 * product coverage without inventing new SKUs: the levitating paperweight is
 * linked into both Desk and Cabinet Paperweights.
 */
export const DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES: Record<string, string[]> = {
  "levitating-paperweight": ["desk-paperweights", "cabinet-paperweights"],
} as const;

/**
 * The 14 demo products, one image per variant, all files real. Each
 * demonstrates at least one Pro capability:
 *
 * - `levitating-paperweight` — multi-variant finish swatches + per-variant
 *   images + an out-of-stock-but-clickable variant.
 * - `suspended-key`, `suspended-disc`, `bracket-clock` — second/third Finish
 *   products (facet breadth across the register).
 * - `glass-orb` — sale-priced entry piece (reporting price spread).
 * - `floating-question-mark` — quote-persona demo (PRICE_GATE_MODE=quote).
 */
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    handle: "levitating-paperweight",
    title: "Levitating Paperweight",
    subtitle: "Holds down absolutely nothing",
    description:
      "A river stone that declined to rest on the desk. Available in four metal collars, each floating slightly higher than the last.",
    categoryHandle: "paperweights",
    attributes: [
      { label: "Material", value: "River stone, brushed collar" },
      { label: "Altitude", value: "11 cm (self-selected)" },
      { label: "Care", value: "Do not tether" },
    ],
    filterable: { material: "Stone" },
    options: [
      {
          title: "Color",
          values: ["Antique Brass", "Chrome", "Black", "Copper"],
        },
    ],
    variants: [
      {
        title: "Antique Brass",
        sku: "DEMO-LEV-AB",
        options: { Color: "Antique Brass" },
        price: 42,
        imageFile: "paperweight-brass.jpg",
      },
      {
        title: "Chrome",
        sku: "DEMO-LEV-CR",
        options: { Color: "Chrome" },
        price: 46,
        imageFile: "paperweight-chrome.jpg",
      },
      {
        title: "Black",
        sku: "DEMO-LEV-BK",
        options: { Color: "Black" },
        price: 44,
        // Out of stock yet clickable — gallery still follows it (Task 3 fix).
        outOfStock: true,
        imageFile: "paperweight-black.jpg",
      },
      {
        title: "Copper",
        sku: "DEMO-LEV-CU",
        options: { Color: "Copper" },
        price: 48,
        imageFile: "paperweight-copper.jpg",
      },
    ],
  },
  {
    handle: "hanging-compass",
    title: "Hanging Compass",
    subtitle: "Points home from any altitude",
    description:
      "An antique compass that hangs where it was last needed. North remains negotiable; the altitude is not.",
    categoryHandle: "instruments",
    attributes: [
      { label: "Material", value: "Aged brass, glass crystal" },
      { label: "Heading", value: "Wherever you decide" },
    ],
    filterable: { material: "Brass" },
    options: [
      {
        title: "Color",
        values: ["Polished"],
      },
    ],
    variants: [
      {
        title: "Polished",
        sku: "DEMO-COMPASS-OS",
        options: { Color: "Polished" },
        price: 54,
        imageFile: "hanging-compass.jpg",
      },
    ],
  },
  {
    handle: "hovering-cup",
    title: "Hovering Cup",
    subtitle: "For coffee you will never spill",
    description:
      "One cup, one altitude, zero handles. It hovers a considerate distance above any surface and asks nothing of your saucer.",
    categoryHandle: "vessels",
    filterable: { material: "Ceramic" },
    options: [
      {
        title: "Color",
        values: ["Brushed"],
      },
    ],
    variants: [
      {
        title: "Brushed",
        sku: "DEMO-HOV-OS",
        options: { Color: "Brushed" },
        price: 28,
        imageFile: "hovering-cup.jpg",
      },
    ],
  },
  {
    handle: "suspended-hourglass",
    title: "Suspended Hourglass",
    subtitle: "Time, briefly interrupted",
    description:
      "An hourglass that hangs mid-turn. The sand falls, hesitates philosophically, and continues — much like most afternoons.",
    categoryHandle: "timepieces",
    attributes: [
      { label: "Material", value: "Borosilicate glass, oak frame" },
      { label: "Duration", value: "15 minutes, or thereabouts" },
      { label: "Care", value: "Dust gently, argue quietly" },
    ],
    filterable: { material: "Glass" },
    options: [{ title: "Default", values: ["One Size"] }],
    variants: [
      {
        title: "One Size",
        sku: "DEMO-SUS-OS",
        options: { Default: "One Size" },
        price: 64,
        imageFile: "suspended-hourglass.jpg",
      },
    ],
  },
  {
    handle: "suspended-key",
    title: "Suspended Key",
    subtitle: "Opens doors at eye level",
    description:
      "A brass key that floats where you left it. Pairs beautifully with locks you have since reconsidered.",
    categoryHandle: "instruments",
    options: [
      {
          title: "Color",
          values: ["Nickel Matte", "Iron"],
        },
    ],
    filterable: { material: "Metal" },
    variants: [
      {
        title: "Nickel Matte",
        sku: "DEMO-KEY-NM",
        options: { Color: "Nickel Matte" },
        price: 32,
        imageFile: "key-nickel.jpg",
      },
      {
        title: "Iron",
        sku: "DEMO-KEY-IR",
        options: { Color: "Iron" },
        price: 30,
        imageFile: "key-iron.jpg",
      },
    ],
  },
  {
    handle: "pendulum-clock",
    title: "Pendulum Clock",
    subtitle: "The swing without the case",
    description:
      "A marble pendulum clock that keeps exact time while everything around it — weights, chimes, cabinet — declined to be manufactured.",
    categoryHandle: "timepieces",
    attributes: [
      { label: "Material", value: "Marble, brass suspension" },
      { label: "Accuracy", value: "Within a philosophical margin" },
    ],
    filterable: { material: "Marble" },
    options: [
      {
        title: "Color",
        values: ["Matte"],
      },
    ],
    variants: [
      {
        title: "Matte",
        sku: "DEMO-PENDULUM-OS",
        options: { Color: "Matte" },
        price: 88,
        imageFile: "pendulum-clock-marble.jpg",
      },
    ],
  },
  {
    handle: "bracket-clock",
    title: "Bracket Clock",
    subtitle: "The face is willing; the case is not",
    description:
      "A black clock face suspended where the mantel used to be. Ticks quietly, reads instantly, ignores the shelf entirely.",
    categoryHandle: "timepieces",
    options: [
      {
          title: "Color",
          values: ["Antique Brass", "Black"],
        },
    ],
    filterable: { material: "Metal" },
    variants: [
      {
        title: "Antique Brass",
        sku: "DEMO-BRACKET-AB",
        options: { Color: "Antique Brass" },
        price: 76,
        imageFile: "clock-ring-brass.jpg",
      },
      {
        title: "Black",
        sku: "DEMO-BRACKET-BK",
        options: { Color: "Black" },
        price: 79,
        imageFile: "clock-face-black.jpg",
      },
    ],
  },
  {
    handle: "suspended-metronome",
    title: "Suspended Metronome",
    subtitle: "Keeps time at a fixed altitude",
    description:
      "A brass metronome hovering mid-tempo. Conductors appreciate the commitment; furniture appreciates the break.",
    categoryHandle: "instruments",
    attributes: [
      { label: "Material", value: "Brass, felt-damped arm" },
      { label: "Tempo", value: "Whatever the room needs" },
    ],
    filterable: { material: "Brass" },
    options: [
      {
        title: "Color",
        values: ["Burnished"],
      },
    ],
    variants: [
      {
        title: "Burnished",
        sku: "DEMO-METRO-OS",
        options: { Color: "Burnished" },
        price: 68,
        imageFile: "metronome-brass.jpg",
      },
    ],
  },
  {
    handle: "pebble-orbit",
    title: "Pebble Orbit",
    subtitle: "A stone learning circular reasoning",
    description:
      "One river stone circling a point it declines to name. The first unsteady circuit — every collection starts here.",
    categoryHandle: "orbits-orbs",
    attributes: [
      { label: "Material", value: "River stone, oak ring" },
      { label: "Orbit", value: "Counterclockwise by default" },
    ],
    filterable: { material: "Stone" },
    options: [
      {
        title: "Color",
        values: ["Brushed"],
      },
    ],
    variants: [
      {
        title: "Brushed",
        sku: "DEMO-PEBBLE-OS",
        options: { Color: "Brushed" },
        price: 26,
        imageFile: "orbit-ring-stone.jpg",
      },
    ],
  },
  {
    handle: "orbit-sphere",
    title: "Orbit Sphere",
    subtitle: "Brass, on its first lap",
    description:
      "A brass sphere rounding its own private orbit at desk height. Continues whether or not anyone is watching, out of politeness.",
    categoryHandle: "orbits-orbs",
    filterable: { material: "Brass" },
    options: [
      {
        title: "Color",
        values: ["Polished"],
      },
    ],
    variants: [
      {
        title: "Polished",
        sku: "DEMO-ORB-OS",
        options: { Color: "Polished" },
        price: 34,
        imageFile: "orbit-sphere-brass.jpg",
      },
    ],
  },
  {
    handle: "glass-orb",
    title: "Glass Orb",
    subtitle: "The modest moon, indoors",
    description:
      "A pale glass sphere hovering a careful distance above the shelf. Entry pricing for first-time collectors of the impossible.",
    categoryHandle: "orbits-orbs",
    filterable: { material: "Glass" },
    options: [{ title: "Default", values: ["One Size"] }],
    variants: [
      {
        title: "One Size",
        sku: "DEMO-GLASSORB-OS",
        options: { Default: "One Size" },
        // Sale demo: the % off badge lives on this entry-level SKU.
        price: 19,
        imageFile: "orbit-glass-orb.jpg",
      },
    ],
    salePrice: 14,
  },
  {
    handle: "levitating-teapot",
    title: "Levitating Teapot",
    subtitle: "Pours before it lands",
    description:
      "A white ceramic teapot caught mid-pour at a fixed altitude. The stream never reaches the cup; the cup, to its credit, has stopped waiting.",
    categoryHandle: "vessels",
    attributes: [
      { label: "Material", value: "Glazed ceramic" },
      { label: "Pour", value: "Continuous, philosophical" },
    ],
    filterable: { material: "Ceramic" },
    options: [
      {
        title: "Color",
        values: ["Matte"],
      },
    ],
    variants: [
      {
        title: "Matte",
        sku: "DEMO-TEAPOT-OS",
        options: { Color: "Matte" },
        price: 34,
        imageFile: "levitating-teapot.jpg",
      },
    ],
  },
  {
    handle: "levitating-carafe",
    title: "Levitating Carafe",
    subtitle: "Water, held to a higher standard",
    description:
      "A glass carafe suspended half-full above the table it declined to touch. Serve at eye level for full effect.",
    categoryHandle: "vessels",
    filterable: { material: "Glass" },
    options: [
      {
        title: "Color",
        values: ["Etched"],
      },
    ],
    variants: [
      {
        title: "Etched",
        sku: "DEMO-CARAFE-OS",
        options: { Color: "Etched" },
        price: 30,
        imageFile: "levitating-carafe.jpg",
      },
    ],
  },
  {
    handle: "suspended-disc",
    title: "Suspended Disc",
    subtitle: "A coin for wishes that wait",
    description:
      "A polished disc turning slowly where it hangs. Catching light is its entire job, and it is excellent at it.",
    categoryHandle: "reflectors",
    options: [
      {
          title: "Color",
          values: ["Copper", "Chrome", "Antique Brass", "Black"],
        },
    ],
    filterable: { material: "Metal" },
    variants: [
      {
        title: "Copper",
        sku: "DEMO-DISC-CU",
        options: { Color: "Copper" },
        price: 40,
        imageFile: "reflector-disc-copper.jpg",
      },
      {
        title: "Chrome",
        sku: "DEMO-DISC-CR",
        options: { Color: "Chrome" },
        price: 43,
        imageFile: "reflector-disc-chrome.jpg",
      },
      {
        title: "Antique Brass",
        sku: "DEMO-DISC-AB",
        options: { Color: "Antique Brass" },
        price: 41,
        imageFile: "reflector-disc-brass.jpg",
      },
      {
        title: "Black",
        sku: "DEMO-DISC-BK",
        options: { Color: "Black" },
        price: 38,
        imageFile: "reflector-disc-black.jpg",
      },
    ],
  },
  {
    handle: "counterweight-goblet",
    title: "Counterweight Goblet",
    subtitle: "Toasts in the wrong direction",
    description:
      "A pewter goblet balanced against its own weight, hovering while lesser glassware sits. For beverages that deserve ceremony and get suspension instead.",
    categoryHandle: "vessels",
    filterable: { material: "Pewter" },
    options: [
      {
        title: "Color",
        values: ["Burnished"],
      },
    ],
    variants: [
      {
        title: "Burnished",
        sku: "DEMO-GOBLET-OS",
        options: { Color: "Burnished" },
        price: 38,
        imageFile: "goblet-counterweight.jpg",
      },
    ],
  },
  {
    handle: "floating-question-mark",
    title: "Floating Question Mark",
    subtitle: "The object, not the punctuation",
    description:
      "A cast bronze question mark suspended at reading height. Ideal for lobbies, thresholds and conversations you would rather have in person.",
    categoryHandle: "instruments",
    attributes: [
      { label: "Material", value: "Cast bronze" },
      { label: "Edition", value: "Open, like the question" },
    ],
    filterable: { material: "Bronze" },
    options: [{ title: "Default", values: ["One Size"] }],
    variants: [
      {
        title: "One Size",
        sku: "DEMO-QM-OS",
        options: { Default: "One Size" },
        // Quotation-flow demo: priced for quote requests, not checkout heroics.
        price: 120,
        imageFile: "floating-question-mark.jpg",
      },
    ],
  },
];

/** Swatch hexes stamped onto demo Finish option values (registry-compatible). */
export const DEMO_FINISH_SWATCH_COLORS: Record<string, string> = {
  "Antique Brass": "#8a6f4d",
  Chrome: "#cfd6dc",
  Black: "#262626",
  Copper: "#b87333",
  "Nickel Matte": "#9aa0a6",
  Iron: "#3d3d3d",
  // Task 18 (Part 4) fixed palette — added for the new Finish options.
  Brushed: "#a9a29b",
  Matte: "#8a8a85",
  Polished: "#d7d4cf",
  Burnished: "#8c6e4f",
  Etched: "#b7b0a6",
};

/**
 * Swatch hexes for the demo Color option values. Color is the canonical
 * option title (Finish merged into it 2026-09-03), so this map carries both
 * the former finish palette and the decorative colors.
 */
export const DEMO_COLOR_SWATCH_COLORS: Record<string, string> = {
  // Former finish palette (now under Color)
  "Antique Brass": "#8a6f4d",
  Chrome: "#cfd6dc",
  Black: "#262626",
  Copper: "#b87333",
  "Nickel Matte": "#9aa0a6",
  Iron: "#3d3d3d",
  Brushed: "#a9a29b",
  Matte: "#8a8a85",
  Polished: "#d7d4cf",
  Burnished: "#8c6e4f",
  Etched: "#b7b0a6",
  // Decorative colors
  "River Grey": "#9aa3a8",
  Oxide: "#7a5c4a",
  Verde: "#4f6b52",
  Ochre: "#c09a4e",
};

/** True when a product record carries the demo-catalog marker. */
export function isDemoCatalogProduct(product: {
  metadata?: Record<string, unknown> | null;
}): boolean {
  return product.metadata?.[DEMO_CATALOG_METADATA_KEY] === true;
}

/** Minimal shapes PG_CONNECTION can take across Medusa versions/contexts. */
export type PgLike =
  | {
      query: (sql: string) => Promise<unknown>;
    }
  | {
      /** Callable Knex factory: `conn("table").whereILike(...).del()`. */
      table: (table: string) => {
        whereILike: (column: string, pattern: string) => {
          del: () => Promise<unknown>;
        };
        whereIn: (column: string, values: string[]) => {
          del: () => Promise<unknown>;
        };
      };
    };

function isKnex(
  pg: unknown
): pg is Extract<PgLike, { table: unknown }> {
  return (
    typeof pg === "function" &&
    "table" in pg &&
    typeof (pg as { table?: unknown }).table === "function"
  );
}

function isPgClient(pg: unknown): pg is Extract<PgLike, { query: unknown }> {
  return (
    typeof pg === "object" &&
    pg !== null &&
    "query" in pg &&
    typeof (pg as { query?: unknown }).query === "function"
  );
}

/**
 * Delete inventory_item rows for demo SKUs — before deleting demo variants so
 * a re-seed never hits the unique-SKU orphan trap. Handles both connection
 * shapes PG_CONNECTION can take in `medusa exec`:
 *   - a raw `pg` client exposing `.query(sql)` (older/local loader)
 *   - a callable Knex factory exposing `conn("table").whereILike(...).del()`
 *     (v2.13 loader)
 * Best-effort: returns false when no usable connection is available, never
 * throws (callers treat inventory as optional).
 */
export async function deleteDemoInventoryRows(
  pg: unknown,
  opts: { skuLike: string } | { skus: string[] }
): Promise<boolean> {
  if (!pg) {
    return false;
  }
  try {
    if ("skuLike" in opts) {
      if (isKnex(pg)) {
        await pg
          .table("inventory_item")
          .whereILike("sku", opts.skuLike)
          .del();
        return true;
      }
      if (isPgClient(pg)) {
        await pg.query(
          `DELETE FROM inventory_item WHERE sku LIKE '${opts.skuLike}'`
        );
        return true;
      }
      return false;
    }
    const skus = opts.skus;
    if (skus.length === 0) {
      return true;
    }
    if (isKnex(pg)) {
      await pg.table("inventory_item").whereIn("sku", skus).del();
      return true;
    }
    if (isPgClient(pg)) {
      await pg.query(
        `DELETE FROM inventory_item WHERE sku IN (${skus
          .map((sku) => `'${sku}'`)
          .join(", ")})`
      );
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Demo products that carry the "Bestseller" store tag (rendered as a card
 * badge). Color comes from the tag metadata (footer taupe #eae3d9), set in
 * seed-demo-catalog.ts via getOrCreateProductTag.
 */
export const DEMO_BESTSELLER_HANDLES = [
  "levitating-paperweight",
  "pendulum-clock",
  "bracket-clock",
  "suspended-metronome",
  "glass-orb",
] as const;

/**
 * Inventory kit for an out-of-stock demo variant: managed inventory with an
 * empty kit → zero available quantity → genuinely out of stock, while the
 * storefront gallery stays clickable (Task 3 behaviour).
 */
export function oosVariantInventoryKit(): [] {
  return [];
}

/**
 * Build the Medusa create-product DTO for one demo product.
 */
export function buildDemoProductInput(
  demo: DemoProduct,
  context: {
    categoryIdByHandle: Map<string, string>;
    shippingProfileId: string;
    salesChannelId: string;
  }
): CreateProductWorkflowInputDTO {
  const categoryId = context.categoryIdByHandle.get(demo.categoryHandle);
  if (!categoryId) {
    throw new Error(`Demo category missing for ${demo.categoryHandle}`);
  }

  return {
    title: demo.title,
    subtitle: demo.subtitle,
    description: demo.description,
    handle: demo.handle,
    status: ProductStatus.PUBLISHED,
    weight: 400,
    shipping_profile_id: context.shippingProfileId,
    category_ids: [categoryId],
    tag_ids: [],
    images: demo.variants
      .map((variant) => variant.imageFile)
      .filter((file): file is string => Boolean(file))
      .map((file) => ({ url: `${DEMO_IMAGE_DIR}/${file}` })),
    thumbnail: `${DEMO_IMAGE_DIR}/${demo.variants[0]?.imageFile ?? "placeholder.svg"}`,
    metadata: {
      [DEMO_CATALOG_METADATA_KEY]: DEMO_CATALOG_MARKER,
      ...(demo.salePrice === undefined ? {} : { demo_sale_price: demo.salePrice }),
      ...(demo.attributes ? { attributes: demo.attributes } : {}),
      ...(demo.filterable ? { filterable: demo.filterable } : {}),
      ...(demo.fullDescriptionHtml
        ? { full_description: demo.fullDescriptionHtml }
        : {}),
    } as CreateProductWorkflowInputDTO["metadata"],
    options: demo.options.map((option) => ({
      title: option.title,
      values: option.values,
    })),
    variants: demo.variants.map((variant) => ({
      title: variant.title,
      sku: variant.sku,
      options: variant.options,
      // Per-variant thumbnail drives the PDP gallery (variant-aware images)
      // and product cards that render the selected/first-variant image.
      ...(variant.imageFile
        ? { thumbnail: `${DEMO_IMAGE_DIR}/${variant.imageFile}` }
        : {}),
      manage_inventory: Boolean(variant.outOfStock),
      inventory_items: variant.outOfStock ? oosVariantInventoryKit() : undefined,
      prices: [{ amount: variant.price, currency_code: "usd" }],
    })),
    sales_channels: [{ id: context.salesChannelId }],
  };
}

/** Log helper shared by the seed and strip scripts. */
export function logDemo(logger: Logger, message: string): void {
  logger.info(`[demo-catalog] ${message}`);
}

/**
 * Merge existing product metadata with the deterministic demo keys from
 * `buildDemoProductInput().metadata`. Unrelated keys are preserved; the
 * intended demo keys win on conflict (mirrors `getOrCreateProductCategories`).
 *
 * @returns the merged metadata and whether any deterministic key changed.
 */
export function mergeDemoProductMetadata(
  existing: Record<string, unknown> | null | undefined,
  intended: Record<string, unknown>
): { metadata: Record<string, unknown>; changed: boolean } {
  const base: Record<string, unknown> = existing ?? {};
  const metadata = {
    ...base,
    ...intended,
  };
  let changed = false;
  for (const [key, value] of Object.entries(intended)) {
    const current = base[key];
    if (
      JSON.stringify(current) !== JSON.stringify(value) ||
      // A key that is present in `intended` but absent from the existing record
      // is also a change even when both stringify to `undefined`.
      !(key in base)
    ) {
      changed = true;
      break;
    }
  }
  return { metadata, changed };
}

/**
 * Create the demo product's declared options that do not exist yet on the
 * existing product (Task 18b).
 *
 * Medusa's `updateProducts` deep-update matches options by title and only
 * updates rows that already exist — a brand-new option (e.g. `Color` on a
 * pre-Task-18 DB that only has `Finish`) is normalized away, never created.
 * Creating the missing options (with their values) first puts them on the
 * same "existing option" footing as Finish, so the subsequent deep-update can
 * attach variant tuples to them.
 *
 * Idempotent: only options whose title is absent from the product are
 * created, so re-running the seed cannot duplicate option values or variants.
 */
async function ensureDemoProductOptions(
  productModuleService: Pick<
    IProductModuleService,
    "listProductOptions" | "createProductOptions"
  >,
  logger: Logger,
  productId: string,
  demo: DemoProduct,
  intendedOptions: { title: string; values: string[] }[]
): Promise<void> {
  const existingOptions = (await productModuleService.listProductOptions(
    { product_id: productId },
    { take: 100, select: ["id", "title"] }
  )) as unknown as { id: string; title?: string }[];

  const existingTitles = new Set(
    (existingOptions ?? []).map((option) => option.title?.toLowerCase())
  );

  const missing = intendedOptions.filter(
    (option) => !existingTitles.has(option.title.toLowerCase())
  );
  if (missing.length === 0) {
    return;
  }

  // Values are passed as plain strings — Medusa's createOptions_ normalizes
  // them into { value } rows, and string form keeps the register readable.
  await productModuleService.createProductOptions(
    missing.map((option) => ({
      title: option.title,
      values: option.values,
      product_id: productId,
    }))
  );
  logDemo(
    logger,
    `Created ${missing.length} missing option(s) for existing product ${demo.handle}: ${missing
      .map((option) => option.title)
      .join(", ")}.`
  );
}

/**
 * Task 17 — apply demo filterable metadata on an existing product instead of
 * skipping it. Idempotent: when the deterministic demo keys already match, the
 * product is left untouched (`"unchanged"`) so a second seed run is a no-op.
 *
 * Existing metadata is merged (never replaced wholesale) and the demo_catalog
 * marker is preserved, so `strip:demo` still finds the row.
 */
export async function upsertDemoProductMetadata(
  productModuleService: Pick<
    IProductModuleService,
    | "updateProducts"
    | "listProductVariants"
    | "deleteProductVariants"
    | "listProductOptions"
    | "createProductOptions"
  >,
  logger: Logger,
  demo: DemoProduct,
  existing: { id: string; metadata?: Record<string, unknown> | null },
  context: {
    categoryIdByHandle: Map<string, string>;
    shippingProfileId: string;
    salesChannelId: string;
  },
  options?: {
    /**
     * Also apply the register's canonical options + variants. When a demo DB
     * was seeded before Finish/Color existed, this adds the missing option
     * values and variants, and removes variants whose SKU is no longer in the
     * register (stale Finish-only tuples superseded by Finish+Color).
     *
     * Medusa's `updateProducts` deep-updates options/variants by title/tuple,
     * so re-running is idempotent (no duplicates).
     *
     * Task 18b — `updateProducts` only deep-updates options it can resolve to
     * an existing row by title; an option that does not exist yet (Color on a
     * pre-Task-18 DB) is normalized away and never created. Missing options
     * are therefore created first via `createProductOptions` (with their
     * values), then `updateProducts` is still called so it can attach the
     * variant tuples to the now-complete option surface.
     */
    applyOptionsAndVariants?: boolean;
    /**
     * Postgres connection (from the seed's PG_CONNECTION) used to delete
     * orphaned inventory rows for pruned variants. When absent, pruning skips
     * the orphaned-inventory cleanup (best-effort).
     */
    pg?: { query: (sql: string) => Promise<unknown[]> };
  }
): Promise<"updated" | "unchanged"> {
  const input = buildDemoProductInput(demo, context);
  const intended = (input.metadata ?? {}) as Record<string, unknown>;
  const { metadata, changed } = mergeDemoProductMetadata(
    existing.metadata,
    intended
  );

  if (!(changed || options?.applyOptionsAndVariants)) {
    logDemo(logger, `Product ${demo.handle} already has current metadata.`);
    return "unchanged";
  }

  // Task 18b — pre-create options that are missing on the existing product
  // (e.g. Color on a pre-Task-18 DB that only has Finish). This MUST happen
  // before `updateProducts`: Medusa's deep-update normalizes options by title
  // match and silently drops options with no matching DB row, so a bare
  // `options` array would never create them.
  if (options?.applyOptionsAndVariants) {
    await ensureDemoProductOptions(
      productModuleService,
      logger,
      existing.id,
      demo,
      input.options ?? []
    );
  }

  const data: Record<string, unknown> = { metadata };
  let existingVariants: { id: string; sku?: string | null }[] = [];
  if (options?.applyOptionsAndVariants) {
    data.options = input.options;

    // Fresh-DB idempotency (nuke + reseed): the minimal seed already created
    // the canonical variant surface, so `updateProducts` would treat these
    // id-less variants as new rows and blow up with "Product variant with
    // sku … already exists". Match existing variants by SKU and attach their
    // ids so Medusa updates in place; SKUs not present yet (e.g. Finish+Color
    // tuples added to an older DB) are left id-less so they still get created.
    const variantResult = await productModuleService.listProductVariants(
      { product_id: existing.id },
      { take: 100, select: ["id", "sku"] }
    );
    existingVariants = (Array.isArray(variantResult[0]) ? variantResult[0] : variantResult) as unknown as {
      id: string;
      sku?: string | null;
    }[];
    const skuToId = new Map(
      (existingVariants ?? [])
        .filter((variant) => variant.sku)
        .map((variant) => [variant.sku, variant.id])
    );
    data.variants = (input.variants ?? []).map(
      (variant: { sku?: string | null }) =>
        variant.sku && skuToId.has(variant.sku)
          ? { ...variant, id: skuToId.get(variant.sku) }
          : variant
    );
  }

  await productModuleService.updateProducts(existing.id, data as never);

  if (options?.applyOptionsAndVariants) {
    await pruneStaleDemoVariants(
      productModuleService,
      logger,
      existing.id,
      demo,
      options.pg,
      existingVariants
    );
    logDemo(
      logger,
      `Updated options + variants for existing product ${demo.handle}.`
    );
  } else {
    logDemo(logger, `Updated metadata for existing product ${demo.handle}.`);
  }
  return "updated";
}

/**
 * Remove variants of a demo product whose SKU is not in the demo register.
 *
 * When a DB was seeded before Finish/Color options existed, products carry
 * Finish-only tuples (e.g. `{Finish:"Antique Brass"}`). The register now
 * defines Finish+Color tuples, so the old tuples are superseded — they are
 * not in the intended SKU set and would otherwise linger forever. Deleting
 * them keeps the demo product surface exactly aligned with the register.
 *
 * SKU is the registry identity across seed runs — the intended SKUs come from
 * the same `buildDemoProductInput` that produced the upserted variants.
 */
async function pruneStaleDemoVariants(
  productModuleService: Pick<
    IProductModuleService,
    "listProductVariants" | "deleteProductVariants"
  >,
  logger: Logger,
  productId: string,
  demo: DemoProduct,
  pg?: unknown,
  knownVariants?: { id: string; sku?: string | null }[]
): Promise<void> {
  const intendedSkus = new Set(demo.variants.map((variant) => variant.sku));
  const current = knownVariants ?? ((await productModuleService.listProductVariants(
    { product_id: productId },
    { take: 100, select: ["id", "sku"] }
  )) as unknown as { id: string; sku?: string | null }[]);

  const stale = (current ?? []).filter(
    (variant) => variant.sku && !intendedSkus.has(variant.sku)
  );
  if (stale.length === 0) {
    return;
  }

  // Delete inventory items for stale variants first (same orphaned-SKU trap
  // the strip script documents): a re-seed fails with "Inventory item with
  // sku … already exists" if inventory rows outlive their variant.
  const staleSkus = stale
    .map((variant) => variant.sku)
    .filter((sku): sku is string => Boolean(sku));
  await deleteDemoInventoryRows(pg, { skus: staleSkus });

  await productModuleService.deleteProductVariants(
    stale.map((variant) => variant.id)
  );
  logDemo(
    logger,
    `Pruned ${stale.length} stale variant(s) for existing product ${demo.handle}.`
  );
}

export type DemoSeedContext = ExecArgs;
export type DemoProductService = IProductModuleService;
