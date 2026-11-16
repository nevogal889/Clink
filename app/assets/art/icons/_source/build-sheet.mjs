// Builds the drink icon contact sheet (DESIGN.md 3.5 QA) at docs/art/icons-sheet.html.
// Every icon at 24 px (Icon S) and 64 px (Icon L), on light and dark surface.base,
// plus each S icon on its category tint. Optional: --png <file> renders it with Playwright.
//
// Run: node app/assets/art/icons/_source/build-sheet.mjs [--png /path/sheet.png]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DRINK_IDS } from './draw-icons.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS = join(HERE, '..');
const ROOT = join(HERE, '../../../../..');
const OUT = join(ROOT, 'docs/art/icons-sheet.html');
const theme = JSON.parse(readFileSync(join(ICONS, 'theme.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(ROOT, 'packages/shared/generated/catalog.json'), 'utf8'));
const names = Object.fromEntries(catalog.drinks.map((d) => [d.id, d.name]));

export function toDark(svg) {
  let out = svg;
  for (const [from, to] of Object.entries(theme.dark)) out = out.split(from).join(to);
  return out.split(`stroke-opacity="${theme.gleamOpacity.light}"`).join(`stroke-opacity="${theme.gleamOpacity.dark}"`);
}
const strip = (svg) => svg.replace(/<!--[\s\S]*?-->\n?/g, '').trim();
const sized = (svg, px) => svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);

const TINT = {
  coffee: ['#EFE6DF', '#2A211B'],
  matcha: ['#E3ECD8', '#1D2817'],
  tea: ['#F5EDCF', '#2A2512'],
  smoothie_juice: ['#F7E0EA', '#2F1823'],
  water: ['#DCEEF3', '#102A33'],
};
const CATS = [
  ['coffee', 'Coffee'],
  ['matcha', 'Matcha'],
  ['tea', 'Tea'],
  ['smoothie_juice', 'Smoothie & Juice'],
  ['water', 'Water'],
];

function cell(id, mode) {
  const s = strip(readFileSync(join(ICONS, `${id}.24.svg`), 'utf8'));
  const l = strip(readFileSync(join(ICONS, `${id}.64.svg`), 'utf8'));
  const f = mode === 'dark' ? toDark : (x) => x;
  const cat = id.split('.')[0];
  const tint = TINT[cat][mode === 'dark' ? 1 : 0];
  return `<figure class="cell">
  <div class="row">
    <span class="i24">${sized(f(s), 24)}</span>
    <span class="i24 tint" style="background:${tint}">${sized(f(s), 24)}</span>
    <span class="i64">${sized(f(l), 64)}</span>
    <span class="z">${sized(f(s), 72)}</span>
  </div>
  <figcaption>${names[id] ?? id}<br><code>${id}</code></figcaption>
</figure>`;
}

function panel(mode) {
  return `<section class="panel ${mode}">
<h2>${mode === 'dark' ? 'Dark' : 'Light'}: 24 px S, S on tint, 64 px L, S at 3x</h2>
${CATS.map(([key, label]) => {
  const ids = DRINK_IDS.filter((d) => d.startsWith(`${key}.`));
  return `<h3>${label}</h3><div class="grid">${ids.map((id) => cell(id, mode)).join('\n')}</div>`;
}).join('\n')}
</section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drink icon sheet</title>
<style>
  :root { --base:#F6F8F9; --ink:#17202A; --ink2:#4A5563; --line:#D5DCE2; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--base); color:var(--ink); font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding:16px; }
  header h1 { font-size:18px; margin:0 0 4px; }
  header p { margin:0; color:var(--ink2); max-width:70ch; }
  .panel { padding:8px 16px 24px; }
  .panel.light { background:#F6F8F9; color:#17202A; }
  .panel.dark { background:#131A22; color:#EEF2F5; }
  .panel.dark figcaption code { color:#A9B4BF; }
  h2 { font-size:15px; margin:12px 0 4px; }
  h3 { font-size:13px; margin:14px 0 6px; font-weight:600; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap:8px 12px; }
  .cell { margin:0; }
  .row { display:flex; align-items:flex-end; gap:8px; }
  .row svg { display:block; }
  .tint { padding:4px; }
  figcaption { font-size:12px; margin-top:4px; }
  figcaption code { font-size:10px; color:#4A5563; }
</style>
</head>
<body>
<header>
  <h1>Drink icons, ${DRINK_IDS.length} drinks</h1>
  <p>Generated from app/assets/art/icons by _source/build-sheet.mjs. Light masters as shipped; dark uses the swap in theme.json. Review per DESIGN.md 3.5 before each release that changes art.</p>
</header>
${panel('light')}
${panel('dark')}
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT}`);

const pngArg = process.argv.indexOf('--png');
if (pngArg > 0) {
  const require = createRequire(import.meta.url);
  let pw;
  try {
    pw = require('playwright');
  } catch {
    pw = require(join(process.execPath, '../../lib/node_modules/playwright'));
  }
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`file://${OUT}`);
  await page.screenshot({ path: process.argv[pngArg + 1], fullPage: true });
  await browser.close();
  console.log(`wrote ${process.argv[pngArg + 1]}`);
}
