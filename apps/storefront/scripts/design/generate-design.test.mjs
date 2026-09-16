import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_REGISTRY, getRegistryIndex, isAllowedEdit } from "../../design/editor.registry.mjs";
import { compileDesignSystem } from "./generate-design.mjs";

const unknownReferencePattern = /Unknown token reference: reference\.missing/;

const documents = [
  {
    reference: {
      color: {
        brand: {
          500: { $type: "color", $value: "#860044" },
          700: { $type: "color", $value: "#650034" },
        },
        neutral: {
          0: { $type: "color", $value: "#ffffff" },
          950: { $type: "color", $value: "#111827" },
        },
      },
      radius: { md: { $type: "dimension", $value: { value: 8, unit: "px" } } },
    },
  },
  {
    semantic: {
      color: {
        surface: { raised: { $type: "color", $value: "{reference.color.neutral.0}" } },
        content: { primary: { $type: "color", $value: "{reference.color.neutral.950}" } },
        action: {
          primary: {
            background: { $type: "color", $value: "{reference.color.brand.500}" },
            hover: { $type: "color", $value: "{reference.color.brand.700}" },
            foreground: { $type: "color", $value: "{reference.color.neutral.0}" },
          },
        },
      },
      radius: { card: { $type: "dimension", $value: "{reference.radius.md}" } },
    },
  },
  {
    component: {
      productCard: {
        background: { $type: "color", $value: "{semantic.color.surface.raised}" },
        title: { $type: "color", $value: "{semantic.color.content.primary}" },
        radius: { $type: "dimension", $value: "{semantic.radius.card}" },
      },
    },
  },
];

test("compiles DTCG aliases into deterministic CSS and Impeccable design context", () => {
  const first = compileDesignSystem(documents, { name: "Vulpy Commerce" });
  const second = compileDesignSystem(documents, { name: "Vulpy Commerce" });

  assert.deepEqual(first, second);
  assert.ok(first.css.includes("--design-color-action-primary-background: #860044;"));
  assert.ok(first.css.includes("--product-card-radius: 8px;"));
  assert.ok(first.css.includes("@theme inline"));
  assert.ok(first.css.includes("--color-product-card-background: var(--product-card-background);"));
  assert.ok(first.designMarkdown.includes("name: Vulpy Commerce"));
  assert.ok(first.designMarkdown.includes("Primary action: `#860044`"));
  assert.equal(first.manifest.tokens["component.productCard.radius"].resolvedValue, "8px");
});

test("applies sparse per-store overrides without deleting the base token tree", () => {
  const output = compileDesignSystem(
    [...documents, { reference: { color: { brand: { 500: { $type: "color", $value: "#0057b8" } } } } }],
    { name: "Blue Store" }
  );

  assert.ok(output.css.includes("--design-color-action-primary-background: #0057b8;"));
  assert.ok(output.css.includes("--design-color-action-primary-hover: #650034;"));
});

test("rejects unresolved aliases instead of emitting broken CSS", () => {
  assert.throws(
    () => compileDesignSystem([{ semantic: { broken: { $type: "color", $value: "{reference.missing}" } } }]),
    unknownReferencePattern
  );
});

test("editor registry: every entry has required fields and a non-empty path", () => {
  for (const entry of EDITOR_REGISTRY) {
    assert.ok(entry.path && entry.path.length > 0, `missing path in entry: ${JSON.stringify(entry)}`);
    assert.ok(entry.label, `missing label for path: ${entry.path}`);
    assert.ok(entry.hint, `missing hint for path: ${entry.path}`);
    assert.ok(["color", "fontFamily", "fontWeight", "dimension", "number", "string"].includes(entry.type),
      `invalid type "${entry.type}" for path: ${entry.path}`);
    assert.ok(["low", "medium", "high"].includes(entry.dangerLevel),
      `invalid dangerLevel "${entry.dangerLevel}" for path: ${entry.path}`);
  }
});

test("editor registry: no duplicate paths", () => {
  const seen = new Set();
  for (const entry of EDITOR_REGISTRY) {
    assert.ok(!seen.has(entry.path), `duplicate path in registry: ${entry.path}`);
    seen.add(entry.path);
  }
});

test("editor registry: isAllowedEdit accepts valid hex colours and rejects bad values", () => {
  assert.ok(isAllowedEdit("reference.color.brand.500", "#3c50e0"));
  assert.ok(isAllowedEdit("reference.color.brand.500", "#fff"));
  assert.ok(!isAllowedEdit("reference.color.brand.500", "blue"));
  assert.ok(!isAllowedEdit("reference.color.brand.500", "#GGGGGG"));
  assert.ok(!isAllowedEdit("reference.color.brand.500", ""));
  // Unregistered path is always rejected
  assert.ok(!isAllowedEdit("reference.color.fancy.unicorn", "#3c50e0"));
});

test("editor registry: isAllowedEdit enforces enum allow-lists for fontWeight", () => {
  assert.ok(isAllowedEdit("reference.font.weight.bold", "700"));
  assert.ok(!isAllowedEdit("reference.font.weight.bold", "350"));
});

test("editor registry: getRegistryIndex returns stable map across calls", () => {
  const a = getRegistryIndex();
  const b = getRegistryIndex();
  assert.strictEqual(a, b, "index should be the same Map instance (memoised)");
  assert.ok(a.has("reference.color.brand.500"));
});

test("editor registry: store.tokens.json paths are all registered", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = (await import("node:path")).default;
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const storeRaw = JSON.parse(await readFile(path.join(appRoot, "design/themes/store.tokens.json"), "utf8"));

  function flatTokenPaths(node, prefix = []) {
    const paths = [];
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) { continue; }
      const tokenPath = [...prefix, key];
      if (value && typeof value === "object" && "$value" in value) {
        paths.push(tokenPath.join("."));
      } else if (value && typeof value === "object") {
        paths.push(...flatTokenPaths(value, tokenPath));
      }
    }
    return paths;
  }

  const idx = getRegistryIndex();
  const tokenPaths = flatTokenPaths(storeRaw);
  for (const tp of tokenPaths) {
    assert.ok(idx.has(tp), `store.tokens.json path not in registry: ${tp}`);
  }
});
