#!/usr/bin/env node
/**
 * WCAG contrast ratio calculator for design review.
 *
 * Usage: node contrast.mjs "#e6e9ef #0f1115" "#ffffff #4f8cff" ...
 * Each argument is a pair of hex colors (space-separated, quoted as one arg).
 * Prints ratio + AA pass/fail (4.5:1 normal text, 3.0:1 large text).
 */
function lum(hex) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function cr(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const pairs = process.argv
  .slice(2)
  .map((arg) => arg.split(/\s+/))
  .filter((p) => p.length === 2);
if (!pairs.length) {
  console.error('Usage: node contrast.mjs "#e6e9ef #0f1115" "#ffffff #4f8cff" ...');
  process.exit(1);
}
for (const [a, b] of pairs) {
  const r = cr(a, b);
  const flag = r >= 4.5 ? "AA normal OK" : r >= 3.0 ? "AA large only (3.0+)" : "FAIL <3.0";
  console.log(`${a} on ${b}: ${r.toFixed(2)}:1  [${flag}]`);
}
