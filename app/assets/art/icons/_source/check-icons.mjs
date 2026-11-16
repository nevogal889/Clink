// Checks the drink icons against DESIGN.md 3.4 and 3.5. Exits non-zero on any failure.
//  - one icon per catalog drink id (packages/shared/generated/catalog.json), in both grids
//  - viewBox exactly 0 0 24 24 / 0 0 64 64
//  - no text, rasters, filters, CSS classes, style attributes or scripts
//  - colours are literal hex from the illustration palette, or the L shade tone derived from it
//  - the files on disk match what draw-icons.mjs draws today (no hand edits drift)
//
// Run: node app/assets/art/icons/_source/check-icons.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, DRINK_IDS, render, shade } from './draw-icons.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS = join(HERE, '..');
const ROOT = join(HERE, '../../../../..');
const catalog = JSON.parse(
  readFileSync(join(ROOT, 'packages/shared/generated/catalog.json'), 'utf8'),
);
const catalogIds = catalog.drinks.map((d) => d.id).sort();

const errors = [];
const fail = (m) => errors.push(m);

// 1. coverage
const drawn = [...DRINK_IDS].sort();
if (JSON.stringify(drawn) !== JSON.stringify(catalogIds)) {
  fail(
    `drawn ids differ from catalog.\n  missing: ${catalogIds.filter((i) => !drawn.includes(i))}\n  extra: ${drawn.filter((i) => !catalogIds.includes(i))}`,
  );
}
if (drawn.length !== 42) fail(`expected 42 drinks, drew ${drawn.length}`);
const files = readdirSync(ICONS)
  .filter((f) => f.endsWith('.svg'))
  .sort();
const expected = catalogIds.flatMap((id) => [`${id}.24.svg`, `${id}.64.svg`]).sort();
for (const f of expected) if (!files.includes(f)) fail(`missing file ${f}`);
for (const f of files) if (!expected.includes(f)) fail(`unexpected file ${f}`);

// 2. per-file rules
const palette = new Set(Object.values(C).map((h) => h.toUpperCase()));
const allowed = new Set([...palette, ...[...palette].map(shade)]);
for (const f of files) {
  const svg = readFileSync(join(ICONS, f), 'utf8');
  const grid = f.endsWith('.24.svg') ? 24 : 64;
  if (!svg.includes(`viewBox="0 0 ${grid} ${grid}"`))
    fail(`${f}: viewBox is not 0 0 ${grid} ${grid}`);
  for (const bad of [
    '<text',
    '<image',
    '<filter',
    'filter=',
    'class=',
    'style=',
    '<script',
    '<style',
    'href=',
    'url(',
  ]) {
    if (svg.includes(bad)) fail(`${f}: contains ${bad}`);
  }
  for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
    const v = m[1];
    if (v === 'none') continue;
    if (!/^#[0-9A-Fa-f]{6}$/.test(v)) fail(`${f}: colour ${v} is not a literal 6-digit hex`);
    else if (!allowed.has(v.toUpperCase()))
      fail(`${f}: colour ${v} is not in the illustration palette`);
  }
  // the gleam opacity is reserved for the gleam (theme.json swaps it for dark)
  if (grid === 24 && svg.includes('stroke-opacity="0.85"'))
    fail(`${f}: Icon S must not have a gleam`);
  if (svg.length > 12000) fail(`${f}: ${svg.length} bytes, budget is 12 KB per icon`);
  const [id] = f.split(/\.(24|64)\.svg$/);
  if (DRINK_IDS.includes(id)) {
    const fresh = render(id, grid === 24 ? 'S' : 'L');
    if (fresh !== svg)
      fail(
        `${f}: differs from draw-icons.mjs output; edit the generator, not the file, then re-run it`,
      );
  }
}

const total = files.reduce((n, f) => n + readFileSync(join(ICONS, f)).length, 0);
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(
  `ok: ${files.length} icons for ${drawn.length} drinks, ${(total / 1024).toFixed(1)} KB total`,
);
