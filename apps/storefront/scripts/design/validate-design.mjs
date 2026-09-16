#!/usr/bin/env node

/**
 * design:validate — full validation gate chain after token edits.
 *
 * Runs in order, fails fast:
 * 1. Registry validation (compiler does this)
 * 2. Token compilation (catches unresolved aliases, circular refs)
 * 3. Artifact drift check (generated files match source tokens)
 * 4. Design test suite
 * 5. Biome lint on design files
 * 6. TypeScript check (storefront)
 *
 * Exit 0 = all gates pass. Non-zero = first failure printed.
 *
 * Usage: node scripts/design/validate-design.mjs
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const workspaceRoot = path.resolve(appRoot, "../..");

const gates = [
  {
    name: "compile + registry validation",
    cmd: "node",
    args: [path.join(__dirname, "generate-design.mjs")],
    cwd: workspaceRoot,
  },
  {
    name: "artifact drift check",
    cmd: "node",
    args: [path.join(__dirname, "generate-design.mjs"), "--check"],
    cwd: workspaceRoot,
  },
  {
    name: "design test suite",
    cmd: "node",
    args: [
      "--test",
      path.join(__dirname, "generate-design.test.mjs"),
      path.join(__dirname, "product-card-contract.test.mjs"),
    ],
    cwd: workspaceRoot,
  },
  {
    name: "biome lint (design)",
    cmd: "npx",
    args: ["biome", "check", "apps/storefront/design/"],
    cwd: workspaceRoot,
  },
  {
    name: "typecheck (storefront)",
    cmd: "npx",
    args: ["tsc", "--noEmit"],
    cwd: appRoot,
  },
];

let passed = 0;

for (const gate of gates) {
  process.stdout.write(`  ⏳ ${gate.name}...`);
  try {
    execFileSync(gate.cmd, gate.args, {
      cwd: gate.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
    process.stdout.write(" ✓\n");
    passed++;
  } catch (err) {
    process.stdout.write(" ✗\n");
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const output = stderr || stdout;
    if (output) {
      console.error(`\n${output.slice(0, 2000)}`);
    }
    console.error(`\n❌ Gate "${gate.name}" failed (${passed}/${gates.length} passed)`);
    process.exit(1);
  }
}

console.log(`\n✅ All ${gates.length} validation gates passed`);
