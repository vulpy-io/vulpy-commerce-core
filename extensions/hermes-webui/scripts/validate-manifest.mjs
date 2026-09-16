#!/usr/bin/env node
/**
 * Manifest validation for the hermes-webui extension bundle (issue #144 gate).
 *
 * Enforces the shipped-bundle contract documented in the Vulpy operator skill:
 *   - manifest.json MUST contain exactly two extension entries:
 *     - `message-renderer` — the public hermes-webui message-renderer
 *       extension (never renamed, never folded into vulpy-commerce);
 *     - `vulpy-commerce`   — the SINGLE entry for all Vulpy Commerce UI
 *       features (new features join its scripts/stylesheets arrays, never
 *       as per-feature entries).
 *   - every referenced script/stylesheet must exist on disk (catches a
 *     missing build output like message-renderer.js before it ships).
 *
 * Usage: node scripts/validate-manifest.mjs   (run via `pnpm validate`)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "manifest.json");

const EXPECTED_IDS = ["message-renderer", "vulpy-commerce"];

function fail(message) {
  console.error(`validate-manifest: ${message}`);
  process.exitCode = 1;
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
} catch (error) {
  fail(`cannot read/parse ${MANIFEST_PATH}: ${error.message}`);
  process.exit(1);
}

const extensions = manifest.extensions;
if (!Array.isArray(extensions)) {
  fail("manifest.extensions must be an array");
  process.exit(1);
}

const ids = extensions.map((entry) => entry?.id);
for (const expected of EXPECTED_IDS) {
  if (!ids.includes(expected)) {
    fail(`missing required extension entry "${expected}"`);
  }
}
const extra = ids.filter((id) => !EXPECTED_IDS.includes(id));
for (const id of extra) {
  fail(
    `unexpected extension entry "${id}" — new Vulpy features join the ` +
      `"vulpy-commerce" entry's scripts/stylesheets arrays (shipped-bundle rule)`,
  );
}

for (const entry of extensions) {
  if (!entry || typeof entry.id !== "string" || !entry.id) {
    fail("every extension entry needs a non-empty string id");
    continue;
  }
  for (const key of ["scripts", "stylesheets"]) {
    for (const ref of entry[key] ?? []) {
      if (typeof ref !== "string" || !ref) {
        fail(`entry "${entry.id}": ${key} entries must be non-empty strings`);
        continue;
      }
      const target = join(ROOT, ref);
      if (!existsSync(target)) {
        fail(`entry "${entry.id}": referenced ${key} file missing: ${ref}`);
      }
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(
  `validate-manifest: OK — ${extensions.length} entry/entries ` +
    `(${ids.join(", ")}) and all referenced assets exist`,
);
