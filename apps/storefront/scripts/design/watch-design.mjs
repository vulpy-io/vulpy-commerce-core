#!/usr/bin/env node

/**
 * design:watch — recompiles tokens.generated.css on any token file change.
 * Next.js hot-reloads the CSS automatically.
 *
 * Usage: node scripts/design/watch-design.mjs
 */

import { execFile } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const compiler = path.join(__dirname, "generate-design.mjs");

const watchPaths = [
  path.join(appRoot, "design/tokens"),
  path.join(appRoot, "design/themes"),
];

let debounce = null;

function compile() {
  execFile("node", [compiler], { cwd: appRoot }, (err, stdout, stderr) => {
    const ts = new Date().toLocaleTimeString();
    if (err) {
      console.error(`[design:watch ${ts}] ✗ compile failed:\n${stderr || err.message}`);
    } else {
      console.log(`[design:watch ${ts}] ✓ tokens.generated.css updated`);
    }
  });
}

function onChange(dir, eventType, filename) {
  if (!(filename?.endsWith(".json"))) { return; }
  if (debounce) { clearTimeout(debounce); }
  debounce = setTimeout(compile, 80);
}

for (const dir of watchPaths) {
  watch(dir, { recursive: true }, (eventType, filename) => onChange(dir, eventType, filename));
}

console.log("[design:watch] watching token files for changes…");
// Keep alive
setInterval(() => { /* keepalive: no-op tick */ }, 60_000);
