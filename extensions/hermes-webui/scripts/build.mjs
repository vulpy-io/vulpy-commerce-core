#!/usr/bin/env node

/**
 * Build the Hermes assistant-ui renderer into a single self-contained IIFE.
 * Output: message-renderer.js
 *
 * Bundle notes:
 * - React 19 + @assistant-ui/react + react-markdown + remark-gfm are bundled in
 * - No external globals assumed — works even if the host page's React version differs
 * - Styles are compiled as a CSS string constant (PANE_CSS) inside the TSX; no separate CSS file
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const entry = resolve(root, "src/message-renderer-island.tsx");
const out = resolve(root, "message-renderer.js");

if (!existsSync(entry)) {
  console.error(`Entry not found: ${entry}`);
  process.exit(1);
}

await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  globalName: "HermesMessageRenderer",
  outfile: out,
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  // Bundle React + assistant-ui inside the IIFE — don't rely on host globals
  external: [],
  // Inline AUI CSS files as text strings so the island can inject them via <style>
  loader: { ".css": "text" },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  minify: true,
  sourcemap: false,
  logLevel: "warning",
  treeShaking: true,
  metafile: false,
});

const size = Math.round(readFileSync(out).length / 1024);
console.log(`build: ${out.split("/").pop()} written (${size} KB)`);
