// Fails if any foreground/background token pair in the design tokens drops below WCAG AA.
// Runs before the web unit tests (`npm test -w @board-table/web`).
import { readFileSync } from 'node:fs';

const TOKENS = new URL('../src/app/ui/styles/_tokens.scss', import.meta.url);

/** [foreground, background, minimum ratio]: 4.5 for text, 3 for large text / UI parts. */
const PAIRS = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-sunken', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-hover', 4.5],
  ['accent-text', 'bg', 4.5],
  ['accent-text', 'surface', 4.5],
  ['accent-text', 'accent-subtle', 4.5],
  ['on-danger', 'danger', 4.5],
  ['danger-text', 'surface', 4.5],
  ['danger-text', 'danger-subtle', 4.5],
  ['warning-text', 'warning-subtle', 4.5],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['border-strong', 'surface', 3],
  // seat colour rings must stand out from the surface (non-text UI: 3:1)
  ...Array.from({ length: 8 }, (_, i) => [`seat-${i}`, 'surface', 3]),
  // game pieces are drawn in seat colours with an outline (non-text UI: 3:1)
  ...Array.from({ length: 8 }, (_, i) => [`seat-${i}`, 'piece-outline', 3]),
  // island board: number tokens are text
  ['token-text', 'token-bg', 4.5],
  ['token-hot', 'token-bg', 4.5],
];

const css = readFileSync(TOKENS, 'utf8');

/** Collects `--bt-color-*: #hex;` declarations inside the block that starts with `marker {`. */
function palette(marker) {
  const start = css.indexOf(`${marker} {`);
  if (start === -1) throw new Error(`Token block "${marker}" not found`);
  const end = css.indexOf('}', start);
  const block = css.slice(start, end);
  return Object.fromEntries(
    [...block.matchAll(/--bt-color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
for (const [name, marker] of [
  ['light', '@mixin bt-light-palette'],
  ['dark', '@mixin bt-dark-palette'],
]) {
  const colors = palette(marker);
  for (const [fg, bg, min] of PAIRS) {
    if (!colors[fg] || !colors[bg]) {
      console.error(`[${name}] missing token: ${!colors[fg] ? fg : bg}`);
      failures++;
      continue;
    }
    const ratio = contrast(colors[fg], colors[bg]);
    if (ratio < min) {
      console.error(`[${name}] ${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast problem(s) in design tokens.`);
  process.exit(1);
}
console.log(`Design token contrast OK (${PAIRS.length} pairs x light/dark).`);
