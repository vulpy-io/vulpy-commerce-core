#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";

const bootPath = process.argv[2];
if (!bootPath) { throw new Error("usage: appearance-behavior.js BOOT_JS"); }

const source = fs.readFileSync(bootPath, "utf8");
const match = source.match(/function _normalizeAppearance\(theme,skin\)\{[\s\S]*?\n\}/);
if (!match) { throw new Error("_normalizeAppearance fixture anchor missing"); }

const context = {};
vm.runInNewContext(
  `const _VALID_THEMES=new Set(['light','dark','system']);
   const _VALID_SKINS=new Set(['default','slate']);
   const _LEGACY_THEME_MAP={slate:{theme:'dark',skin:'slate'}};
   ${match[0]}
   globalThis.normalize = _normalizeAppearance;`,
  context,
);

const cases = [
  [[undefined, "default"], "light"],
  [["invalid", "default"], "light"],
  [["dark", "default"], "dark"],
  [["light", "slate"], "light"],
];
for (const [[theme, skin], expected] of cases) {
  const actual = context.normalize(theme, skin).theme;
  if (actual !== expected) {
    throw new Error(`normalize(${String(theme)}, ${skin}) => ${actual}; expected ${expected}`);
  }
}

process.stdout.write("appearance behavior fixture: 4 cases passed\n");