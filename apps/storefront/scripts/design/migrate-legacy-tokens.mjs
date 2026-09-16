#!/usr/bin/env node
/**
 * Bulk migration: legacy template color classes → semantic design-token classes.
 *
 * Runs in-place over all TSX/TS/JSX files under `src/`.
 * Safe to re-run (idempotent — won't double-migrate).
 *
 * Mapping rationale:
 *   bg-blue                  → bg-action-primary-background   (brand primary CTA fill)
 *   hover:bg-blue-dark       → hover:bg-action-primary-hover  (brand primary hover)
 *   hover:bg-blue            → hover:bg-action-primary-background
 *   bg-dark                  → bg-surface-inverse             (near-black surface)
 *   hover:bg-dark            → hover:bg-surface-inverse
 *   hover:bg-dark/90         → hover:bg-surface-inverse/90
 *   text-dark                → text-content-primary           (#333 body text)
 *   hover:text-dark          → hover:text-content-primary
 *   text-dark-2              → text-content-secondary         (#495270)
 *   text-dark-4              → text-content-muted             (#8D93A5)
 *   text-dark-5              → text-content-muted             (placeholder muted)
 *   text-blue                → text-content-brand             (brand-colored inline text)
 *   hover:text-blue          → hover:text-content-brand
 *   hover:text-blue-dark     → hover:text-content-brand
 *   bg-teal                  → bg-surface-muted               (teal accent bg → neutral muted)
 *   text-red                 → text-status-danger             (required asterisks, error)
 *   hover:text-red           → hover:text-status-danger
 *   focus:ring-blue/20       → focus:ring-focus-ring/20
 *   accent-blue              → accent-action-primary-background
 *   group-hover:bg-blue      → group-hover:bg-action-primary-background
 *   border-blue bg-blue      → border-action-primary-background bg-action-primary-background
 *   border-blue              → border-action-primary-background
 *
 * NOT migrated (intentionally):
 *   bg-gray-*, bg-white, etc. — neutral utilities, leave as-is
 *   hover:bg-red-50           — structural soft-red tint, leave as-is
 *   red-light-* hover states  — structural, leave as-is
 *   bg-blue-1 / border-blue-1 — stale admin widget (EditOrder.tsx), manual review needed
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Replacements (ordered: most-specific first to avoid partial matches) ──────

const REPLACEMENTS = [
  // opacity modifier form first to avoid partial sub-match
  ["hover:bg-dark/90",      "hover:bg-surface-inverse/90"],
  ["hover:bg-dark",         "hover:bg-surface-inverse"],
  ["bg-dark",               "bg-surface-inverse"],
  ["hover:bg-blue-dark",    "hover:bg-action-primary-hover"],
  ["hover:bg-blue",         "hover:bg-action-primary-background"],
  ["bg-blue",               "bg-action-primary-background"],
  ["bg-teal",               "bg-surface-muted"],

  ["hover:text-dark",       "hover:text-content-primary"],
  ["text-dark-4",           "text-content-muted"],
  ["text-dark-5",           "text-content-muted"],
  ["text-dark-2",           "text-content-secondary"],
  ["text-dark",             "text-content-primary"],

  ["hover:text-blue-dark",  "hover:text-content-brand"],
  ["hover:text-blue",       "hover:text-content-brand"],
  ["text-blue",             "text-content-brand"],

  ["hover:text-red",        "hover:text-status-danger"],
  ["text-red",              "text-status-danger"],

  // combined selected-state pattern before individual border-blue
  ["border-blue bg-blue",   "border-action-primary-background bg-action-primary-background"],
  ["border-blue",           "border-action-primary-background"],

  ["ring-blue/20",          "ring-focus-ring/20"],
  ["ring-blue",             "ring-focus-ring"],

  ["accent-blue",           "accent-action-primary-background"],
  ["group-hover:bg-blue",   "group-hover:bg-action-primary-background"],
];

// ── File walker ───────────────────────────────────────────────────────────────

const SOURCE_FILE_RE = /\.(tsx?|jsx?)$/;

function walkSync(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".turbo", ".medusa"].includes(name)) { continue; }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkSync(full, out);
    } else if (SOURCE_FILE_RE.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// ── Migration ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_DIR = resolve(__dirname, "../../src");

let totalFiles = 0;
let changedFiles = 0;
let totalReplacements = 0;
const log = [];

for (const filePath of walkSync(SRC_DIR)) {
  totalFiles++;
  const original = readFileSync(filePath, "utf8");
  let content = original;
  const perFile = {};

  for (const [from, to] of REPLACEMENTS) {
    // Escape special regex chars
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Class boundary: must be preceded by a class-name delimiter and followed by one
    // Delimiters: space " ' ` { } / \ newline
    const re = new RegExp(
      `(?<=[\\s"'\`{:/\\\\])${esc}(?=[\\s"'\`}:/\\\\\n])`,
      "g"
    );
    const before = content;
    content = content.replace(re, to);
    if (content !== before) {
      const hits = (before.match(re) ?? []).length;
      perFile[from] = (perFile[from] ?? 0) + hits;
    }
  }

  if (content !== original) {
    writeFileSync(filePath, content, "utf8");
    changedFiles++;
    const total = Object.values(perFile).reduce((a, b) => a + b, 0);
    totalReplacements += total;
    const rel = filePath.replace(`${SRC_DIR}/`, "");
    log.push(`  ✓ ${rel} (+${total})`);
  }
}

console.log("\nMigration complete:");
console.log(`  Files scanned:  ${totalFiles}`);
console.log(`  Files changed:  ${changedFiles}`);
console.log(`  Replacements:   ${totalReplacements}\n`);
if (log.length) {
  console.log("Changed files:");
  for (const l of log) { console.log(l); }
}
