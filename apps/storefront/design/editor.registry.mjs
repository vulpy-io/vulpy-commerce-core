/**
 * editor.registry.mjs
 *
 * Pure-ESM mirror of editor.registry.ts for use in the Node.js token compiler
 * (generate-design.mjs) and validation scripts.  Kept in sync with the
 * TypeScript source by the registry-sync check in the design:test suite.
 *
 * Import with:
 *   import { EDITOR_REGISTRY, isAllowedEdit } from "../../design/editor.registry.mjs";
 */

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const POSITIVE_NUMBER_RE = /^\d+(\.\d+)?$/;
const isHexColor = (v) => HEX_COLOR_RE.test(v);
const isPositiveNumber = (v) => POSITIVE_NUMBER_RE.test(v) && Number(v) > 0;

export const EDITOR_REGISTRY = [
  // ── Brand palette ──────────────────────────────────────────────────────────
  {
    path: "reference.color.brand.500",
    label: "Brand – Primary",
    hint: "Core brand colour. Drives CTAs, links, focus rings, and the product-card action button.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "reference.color.brand.300",
    label: "Brand – Light accent",
    hint: "Used for hover states and tinted surfaces. Should be a lighter shade of Brand Primary.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "reference.color.brand.700",
    label: "Brand – Dark shade",
    hint: "Button hover and pressed states. Should be a darker shade of Brand Primary.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "reference.color.brand.50",
    label: "Brand – Lightest tint",
    hint: "Subtle tinted surfaces, hovered secondary button fill.",
    type: "color",
    dangerLevel: "low",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "reference.color.brand.100",
    label: "Brand – Light tint",
    hint: "Badge backgrounds, tag fills.",
    type: "color",
    dangerLevel: "low",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.brand.900",
    label: "Brand – Deepest shade",
    hint: "High-contrast brand text, footer backgrounds for strong brand presence.",
    type: "color",
    dangerLevel: "low",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  // ── Highlight / focus ──────────────────────────────────────────────────────
  {
    path: "reference.color.highlight.500",
    label: "Focus ring / Selected state",
    hint: "Input focus ring and selected filter chip. Usually matches Brand Primary.",
    type: "color",
    dangerLevel: "high",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: true,
  },
  // ── Neutral overrides ──────────────────────────────────────────────────────
  {
    path: "reference.color.neutral.50",
    label: "Neutral – Page background",
    hint: "Default page canvas tint. Near-white; tinting gives a warm/cool feel.",
    type: "color",
    dangerLevel: "high",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "reference.color.neutral.100",
    label: "Neutral – Fill tertiary",
    hint: "Subtle background fill for sections and alternating rows.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.200",
    label: "Neutral – Fill secondary / Border secondary",
    hint: "Dividers, card borders, subtle separators.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.300",
    label: "Neutral – Border primary / Fill",
    hint: "Input borders, card outlines, strong dividers.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.500",
    label: "Neutral – Text muted",
    hint: "Placeholder text, disabled states, tertiary labels.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.600",
    label: "Neutral – Text secondary",
    hint: "Secondary body text, metadata.",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.700",
    label: "Neutral – Text primary alt",
    hint: "Primary text alternative (Fox colorText).",
    type: "color",
    dangerLevel: "medium",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.800",
    label: "Neutral – Primary text / Inverse surface",
    hint: "Body text colour and dark button surfaces. Must maintain ≥4.5:1 contrast on canvas.",
    type: "color",
    dangerLevel: "high",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.neutral.950",
    label: "Neutral – Deepest",
    hint: "Maximum contrast neutral.",
    type: "color",
    dangerLevel: "low",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  // ── Status colours ─────────────────────────────────────────────────────────
  {
    path: "reference.color.danger.500",
    label: "Danger – Error / Sale badge",
    hint: "Error messages and sale price text.",
    type: "color",
    dangerLevel: "medium",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "reference.color.success.700",
    label: "Success – In-stock indicator",
    hint: "In-stock badge and success toasts.",
    type: "color",
    dangerLevel: "low",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: false,
  },
  // ── Typography – Families ──────────────────────────────────────────────────
  {
    path: "reference.font.family.body",
    label: "Body typeface",
    hint: "CSS font-family for body text. Fox uses Manrope Variable.",
    type: "fontFamily",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.font.family.heading",
    label: "Heading typeface",
    hint: "CSS font-family for h1–h2. Fox uses Sora Variable.",
    type: "fontFamily",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.font.family.mono",
    label: "Monospace typeface",
    hint: "Used for prices, SKUs, and code blocks.",
    type: "fontFamily",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  // ── Typography – Weights ───────────────────────────────────────────────────
  {
    path: "reference.font.weight.light",
    label: "Display weight",
    hint: "Display/h1 weight (Fox: 320). Ultra-light — large type needs less weight.",
    type: "fontWeight",
    dangerLevel: "medium",
    scope: "brand",
    allowed: ["200", "250", "300", "320", "350", "400"],
    operatorVisible: true,
  },
  {
    path: "reference.font.weight.regular",
    label: "Body weight",
    hint: "Default body text weight (Fox: 450). Slightly bolder than standard 400.",
    type: "fontWeight",
    dangerLevel: "medium",
    scope: "brand",
    allowed: ["350", "380", "400", "420", "450", "480", "500"],
    operatorVisible: true,
  },
  {
    path: "reference.font.weight.medium",
    label: "Medium weight",
    hint: "h3, h5, feature text (Fox: 500).",
    type: "fontWeight",
    dangerLevel: "low",
    scope: "brand",
    allowed: ["450", "500", "550", "600"],
    operatorVisible: false,
  },
  {
    path: "reference.font.weight.semibold",
    label: "Semibold weight",
    hint: "h4/card titles, overlines (Fox: 600).",
    type: "fontWeight",
    dangerLevel: "low",
    scope: "brand",
    allowed: ["550", "600", "650", "700"],
    operatorVisible: false,
  },
  {
    path: "reference.font.weight.bold",
    label: "Bold weight",
    hint: "Strong emphasis (Fox: 700).",
    type: "fontWeight",
    dangerLevel: "low",
    scope: "brand",
    allowed: ["600", "700", "800"],
    operatorVisible: false,
  },
  {
    path: "reference.font.weight.button",
    label: "Button label weight",
    hint: "CTA and button labels (Fox: 800). Very bold for maximum tap-target clarity.",
    type: "fontWeight",
    dangerLevel: "medium",
    scope: "brand",
    allowed: ["500", "600", "700", "800", "900"],
    operatorVisible: true,
  },
  // ── Typography – Sizes ─────────────────────────────────────────────────────
  {
    path: "reference.font.size.h1",
    label: "H1 / Display size",
    hint: "Hero headline (Fox: 48px / 3rem).",
    type: "dimension",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.font.size.h2",
    label: "H2 / Section heading size",
    hint: "Section heading (Fox: 32px / 2rem).",
    type: "dimension",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.font.size.h3",
    label: "H3 / Subheading size",
    hint: "Section subheading (Fox: 28px / 1.75rem).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.h4",
    label: "H4 / Card heading size",
    hint: "Card title (Fox: 24px / 1.5rem).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.h5",
    label: "H5 / Subtitle size",
    hint: "Widget heading (Fox: 22px / 1.35rem).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.body-lg",
    label: "Body large",
    hint: "Feature text, lead paragraphs (Fox: 20px).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.body",
    label: "Body default",
    hint: "Default body text (Fox: 16px).",
    type: "dimension",
    dangerLevel: "medium",
    scope: "commerce-safe",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.body-sm",
    label: "Body small",
    hint: "Secondary body, buttons (Fox: 15px).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.caption",
    label: "Caption",
    hint: "Metadata, timestamps (Fox: 14px).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.overline",
    label: "Overline / Label",
    hint: "Badges, eyebrows (Fox: 13px).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.size.xs",
    label: "Extra small",
    hint: "Fine print, legal (Fox: 12px).",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  // ── Typography – Line heights ──────────────────────────────────────────────
  {
    path: "reference.font.lineHeight.display",
    label: "Display line-height",
    hint: "h1 (Fox: 1.4 → 67.2px at 48px).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.lineHeight.heading",
    label: "Heading line-height",
    hint: "h2 (Fox: 1.25 → 40px at 32px, ✓4px grid).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.lineHeight.subheading",
    label: "Subheading line-height",
    hint: "h3 (Fox: 1.357 → 38px at 28px).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.lineHeight.card",
    label: "Card heading line-height",
    hint: "h4 (Fox: 1.333 → 32px at 24px, ✓4px grid).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.lineHeight.body",
    label: "Body line-height",
    hint: "Default body (Fox: 1.625 → 26px at 16px).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.lineHeight.body-tight",
    label: "Body tight line-height",
    hint: "body-sm, buttons (Fox: 1.6 → 24px at 15px, ✓4px grid).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.lineHeight.caption",
    label: "Caption line-height",
    hint: "14px caption (Fox: 1.571 → 22px).",
    type: "number",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  // ── Typography – Letter spacing ────────────────────────────────────────────
  {
    path: "reference.font.letterSpacing.display",
    label: "Display letter-spacing",
    hint: "h1 tight tracking (Fox: -0.0146em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.letterSpacing.section",
    label: "Section letter-spacing",
    hint: "h2 aggressive tightening (Fox: -0.0375em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.letterSpacing.subheading",
    label: "Subheading letter-spacing",
    hint: "h3 slight expansion (Fox: 0.0018em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.letterSpacing.card",
    label: "Card letter-spacing",
    hint: "h4 (Fox: 0.0021em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.letterSpacing.body",
    label: "Body letter-spacing",
    hint: "Default body (Fox: 0.009em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.letterSpacing.overline",
    label: "Overline letter-spacing",
    hint: "Labels/badges (Fox: 0.00625em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.font.letterSpacing.none",
    label: "No letter-spacing",
    hint: "Buttons, h5 (Fox: 0em).",
    type: "string",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  // ── Spacing / shape ────────────────────────────────────────────────────────
  {
    path: "reference.radius.control",
    label: "Control corner radius",
    hint: "Buttons and inputs (Fox: 5px). Only two radii in the system.",
    type: "dimension",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.radius.panel",
    label: "Panel / Card / Image corner radius",
    hint: "Cards, images, panels (Fox: 10px). The larger of Fox's two radii.",
    type: "dimension",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.radius.badge",
    label: "Badge / Tag corner radius",
    hint: "Border-radius for labels, tags, and status chips.",
    type: "dimension",
    dangerLevel: "low",
    scope: "brand",
    operatorVisible: false,
  },
  {
    path: "reference.radius.md",
    label: "Card corner radius",
    hint: "Product cards and media frames.",
    type: "dimension",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  {
    path: "reference.radius.lg",
    label: "Overlay corner radius",
    hint: "Modals, quickview, and large panels.",
    type: "dimension",
    dangerLevel: "medium",
    scope: "brand",
    operatorVisible: true,
  },
  // ── Semantic overrides (advanced) ──────────────────────────────────────────
  {
    path: "semantic.color.action.primary.background",
    label: "CTA background",
    hint: "Primary button and CTA background color (Fox: #c8743a orange).",
    type: "color",
    dangerLevel: "high",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "semantic.color.action.primary.hover",
    label: "CTA hover",
    hint: "Primary button hover state (Fox: #a15427).",
    type: "color",
    dangerLevel: "medium",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: true,
  },
  {
    path: "semantic.color.action.primary.foreground",
    label: "CTA text color",
    hint: "Text on primary buttons. Must maintain ≥4.5:1 contrast on CTA background.",
    type: "color",
    dangerLevel: "high",
    scope: "commerce-safe",
    allowed: isHexColor,
    operatorVisible: false,
  },
  {
    path: "semantic.color.action.secondary.hover",
    label: "Secondary button hover",
    hint: "Hover fill for ghost/secondary buttons (Fox: lightest brand tint).",
    type: "color",
    dangerLevel: "low",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: false,
  },
  // ── Component overrides ────────────────────────────────────────────────────
  {
    path: "component.footer.background",
    label: "Footer background",
    hint: "Footer surface color (Fox: taupe blend #eae3d9).",
    type: "color",
    dangerLevel: "low",
    scope: "brand",
    allowed: isHexColor,
    operatorVisible: true,
  },
];

/** @type {Map<string, object> | null} */
let _index = null;

export function getRegistryIndex() {
  if (!_index) {
    _index = new Map(EDITOR_REGISTRY.map((e) => [e.path, e]));
  }
  return _index;
}

/**
 * Returns true when `path` is registered AND `value` passes its guard.
 * @param {string} path
 * @param {string} value
 * @returns {boolean}
 */
export function isAllowedEdit(path, value) {
  const entry = getRegistryIndex().get(path);
  if (!entry) {
    return false;
  }
  if (!entry.allowed) {
    return true;
  }
  if (typeof entry.allowed === "function") {
    return entry.allowed(value);
  }
  return entry.allowed.includes(value);
}

/** All paths an operator can see in the Payload UI. */
export const OPERATOR_VISIBLE_PATHS = EDITOR_REGISTRY
  .filter((e) => e.operatorVisible !== false)
  .map((e) => e.path);

/** Surface scope helpers. */
export const BRAND_PATHS = EDITOR_REGISTRY
  .filter((e) => e.scope === "brand")
  .map((e) => e.path);

export const COMMERCE_SAFE_PATHS = EDITOR_REGISTRY
  .filter((e) => e.scope === "commerce-safe")
  .map((e) => e.path);
