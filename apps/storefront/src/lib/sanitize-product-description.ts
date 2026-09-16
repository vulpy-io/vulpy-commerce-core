/**
 * Lightweight, dependency-free rich-text sanitizer for product descriptions.
 *
 * Medusa `metadata.full_description` is authored as HTML but rendered as a
 * plain string in the PDP accordion. Before rendering we must ensure inline
 * HTML (when present) never escalates: strip script/style blocks with their
 * contents, demote `<h1>..<h6>` to `<p><strong>…</strong></p>`, keep a small
 * allow-list of formatting/list tags, and strip event handlers and unsafe
 * URL schemes.
 *
 * No DOM dependency — runs in `node` under the storefront vitest suite.
 */

const SCRIPT_STYLE_RE =
  /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
const HEADING_OPEN_RE = /<h([1-6])\b[^>]*>/gi;
const HEADING_CLOSE_RE = /<\/h([1-6])\s*>/gi;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s>]+))?/g;

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "hr",
  "span",
  "a",
  "img",
  "figure",
  "figcaption",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);
const SAFE_URL_SCHEME = /^(https?:|mailto:|tel:|\/|#|\.)/i;

/**
 * Demote description `<h1>..<h6>` headings to `<p><strong>…</strong></p>` so a
 * rich description never fights the PDP page-level heading hierarchy.
 */
export function demoteDescriptionHeadings(html: string): string {
  return html
    .replace(HEADING_OPEN_RE, "<p><strong>")
    .replace(HEADING_CLOSE_RE, "</strong></p>");
}

function sanitizeAttributes(raw: string): string {
  const kept: string[] = [];

  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null = ATTR_RE.exec(raw);
  while (match !== null) {
    const name = match[1].toLowerCase();

    // Drop event handlers, `style`, `formaction` and other XSS surfaces.
    if (
      name.startsWith("on") ||
      name === "style" ||
      name === "formaction" ||
      name === "srcdoc"
    ) {
      match = ATTR_RE.exec(raw);
      continue;
    }

    let value = match[2] ?? name;
    value = value.replace(/^["']|["']$/g, "");

    // Only allow safe URL schemes on links/images.
    if (
      (name === "href" || name === "src" || name === "xlink:href") &&
      !(value.trim() && SAFE_URL_SCHEME.test(value.trim()))
    ) {
      match = ATTR_RE.exec(raw);
      continue;
    }

    kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    match = ATTR_RE.exec(raw);
  }

  return kept.length > 0 ? ` ${kept.join(" ")}` : "";
}

function filterTag(match: string, name: string, rest: string): string {
  const tagName = name.toLowerCase();
  const isClosing = match.startsWith("</");

  if (!ALLOWED_TAGS.has(tagName)) {
    return "";
  }

  if (isClosing) {
    return `</${tagName}>`;
  }

  const safeAttrs = sanitizeAttributes(rest);
  return VOID_TAGS.has(tagName)
    ? `<${tagName}${safeAttrs} />`
    : `<${tagName}${safeAttrs}>`;
}

/**
 * True when a string looks like HTML (contains an open and close bracket).
 */
export function looksLikeHtml(value: string): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed.includes("<") && trimmed.includes(">");
}

/**
 * Sanitize raw HTML, or return the plain string untouched when it is not
 * HTML-shaped. Empty input returns empty string.
 */
export function sanitizeProductDescriptionHtml(
  html: string | null | undefined
): string {
  const source = (html ?? "").trim();
  if (!source) {
    return "";
  }

  if (!looksLikeHtml(source)) {
    return source;
  }

  const withoutScriptStyle = source.replace(SCRIPT_STYLE_RE, "");
  const demoted = demoteDescriptionHeadings(withoutScriptStyle);

  return demoted.replace(TAG_RE, filterTag).replace(/[ \t]+>/g, ">").trim();
}