#!/usr/bin/env node
// Builds docs/art/before-after.html: the heroes and brand files as committed at a git ref (default
// HEAD) next to the working tree, plus the app icon on home-screen, settings-row, themed-icon and
// notification mocks. For art reviews; rerun after an art pass.
//
//   node scripts/gen-art-gallery-compare.mjs                     write docs/art/before-after.html
//   node scripts/gen-art-gallery-compare.mjs --ref <git ref>     compare against another commit
//   node scripts/gen-art-gallery-compare.mjs --png <file>        also screenshot it at 2x

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CATEGORIES, CATEGORY_NAMES, TINT, darkHero } from './gen-art-gallery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = 'app/assets/art';

export const BRAND_FILES = [
  'app-icon',
  'app-icon-dark',
  'app-icon-mono',
  'android-adaptive-foreground',
  'android-monochrome',
  'android-notification',
  'mark',
  'mark-small',
  'mark-mono',
  'lockup',
];

const uri = (svg) =>
  svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : '';

/** A file as committed at ref, or undefined if it didn't exist there. */
export function atRef(ref, rel, cwd = ROOT) {
  try {
    return execFileSync('git', ['show', `${ref}:${rel}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

function onDisk(rel, root = ROOT) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined;
}

/** { before, after } for every hero and brand file. */
export function collect(ref = 'HEAD', root = ROOT) {
  const pair = (rel) => ({ before: atRef(ref, rel, root), after: onDisk(rel, root) });
  return {
    heroes: Object.fromEntries(CATEGORIES.map((c) => [c, pair(`${ART}/heroes/${c}.svg`)])),
    brand: Object.fromEntries(BRAND_FILES.map((b) => [b, pair(`${ART}/brand/${b}.svg`)])),
    wordmark: onDisk(`${ART}/brand/wordmark.svg`, root),
  };
}

const img = (svg, w, extra = '') =>
  svg
    ? `<img src="${uri(svg)}" width="${w}" ${extra} alt="" />`
    : `<span class="none" style="width:${w}px">none</span>`;

function heroRows(heroes) {
  return CATEGORIES.map((c) => {
    const { before, after } = heroes[c];
    const [lt, dk] = TINT[c];
    const small = (svg, bg, dark) =>
      `<div class="tile" style="background:${bg}">${img(svg && dark ? darkHero(svg) : svg, 48)}</div>`;
    return `<section class="hero-row">
  <h3>${CATEGORY_NAMES[c]}</h3>
  <div class="pair">
    <figure><div class="tile" style="background:${lt}">${img(before, 300)}</div><figcaption>Before</figcaption></figure>
    <figure><div class="tile" style="background:${lt}">${img(after, 300)}</div><figcaption>After</figcaption></figure>
    <figure><div class="tile" style="background:${dk}">${img(after && darkHero(after), 300)}</div><figcaption>After, dark tint</figcaption></figure>
    <figure class="crops"><div class="row">${small(before, lt)}${small(after, lt)}</div><div class="row">${small(before, dk, true)}${small(after, dk, true)}</div><figcaption>48 pt: before, after</figcaption></figure>
  </div>
</section>`;
  }).join('\n');
}

const OTHER_APPS = [
  '#E5534B',
  '#34A853',
  '#F2B33D',
  '#6E5BD8',
  '#111111',
  '#0B7391',
  '#FF8A00',
  '#DDDDDD',
  '#2A9D8F',
  '#555555',
  '#C2345F',
];

function homeScreen(icon, label) {
  const cells = Array.from({ length: 12 }, (_, i) =>
    i === 5
      ? `<div class="app">${img(icon, 60, 'class="squircle"')}<span>Clink</span></div>`
      : `<div class="app"><div class="squircle" style="background:${OTHER_APPS[i % OTHER_APPS.length]}"></div><span>App</span></div>`,
  ).join('');
  return `<figure><div class="home">${cells}</div><figcaption>${label}</figcaption></figure>`;
}

function settingsRows(light, dark) {
  const row = (icon, bg, fg, text) =>
    `<div class="setting" style="background:${bg};color:${fg}">${img(icon, 29, 'class="squircle29"')}<span>${text}</span></div>`;
  return `<div class="settings">${row(light, '#FFFFFF', '#000000', 'Clink')}${row(light, '#FFFFFF', '#000000', 'Notifications')}${row(dark, '#1C1C1E', '#FFFFFF', 'Clink')}</div>`;
}

function masked(svg, size, bg, colour) {
  if (!svg) return `<span class="none" style="width:${size}px">none</span>`;
  return `<span class="mask" style="width:${size}px;height:${size}px;background:${colour};-webkit-mask-image:url(${uri(svg)});mask-image:url(${uri(svg)})"></span>`;
}

function androidRow(b) {
  const adaptive = (fg, shape) =>
    fg
      ? `<span class="adaptive ${shape}"><img src="${uri(fg)}" width="88" alt="" /></span>`
      : `<span class="none" style="width:60px">none</span>`;
  const themed = (mono, bg, fg) =>
    mono
      ? `<span class="adaptive circle" style="background:${bg}">${masked(mono, 88, bg, fg)}</span>`
      : `<span class="none" style="width:60px">none</span>`;
  const mono = b['android-monochrome'] ?? b['android-adaptive-foreground'];
  const notif = (svg, bg, fg) =>
    `<span class="notif" style="background:${bg};color:${fg}">${masked(svg, 24, bg, fg)}${masked(svg, 18, bg, fg)}<span>Clink · now</span></span>`;
  return `<div class="android">${adaptive(b['android-adaptive-foreground'], 'circle')}${adaptive(b['android-adaptive-foreground'], 'rounded')}${themed(mono, '#D8E2FF', '#2B3A6B')}${themed(mono, '#2B3A6B', '#D8E2FF')}</div>
<div class="android">${notif(b['android-notification'], '#E8EAED', '#2443A6')}${notif(b['android-notification'], '#202124', '#E8EAED')}</div>`;
}

function brandBlock(label, b, wordmark) {
  const tinted = b['app-icon-mono']
    ? `<span class="tinted">${img(b['app-icon-mono'], 60)}</span>`
    : '<span class="none" style="width:60px">none</span>';
  return `<section class="brand">
  <h3>${label}</h3>
  <div class="brand-grid">
    ${homeScreen(b['app-icon'], 'Home screen, 60 pt')}
    <figure><div class="dark-home">${img(b['app-icon-dark'], 60, 'class="squircle"')}${tinted}</div><figcaption>iOS dark and tinted, 60 pt</figcaption></figure>
    <figure>${settingsRows(b['app-icon'], b['app-icon-dark'])}<figcaption>Settings row, 29 pt</figcaption></figure>
    <figure>${androidRow(b)}<figcaption>Android: adaptive (circle, rounded), themed, notification at 24 and 18 dp</figcaption></figure>
    <figure><div class="marks">${img(b.mark, 140)}${img(b.mark, 64)}${img(b['mark-small'], 32)}${img(b['mark-small'], 16)}${img(b['mark-mono'], 64)}</div><figcaption>Mark 140, 64; small 32, 16; mono</figcaption></figure>
    <figure><div class="marks">${img(b.lockup, 360)}${img(b.lockup, 140)}</div><figcaption>Lockup (wordmark unchanged)</figcaption></figure>
  </div>
</section>`;
}

export function buildCompare(data, ref = 'HEAD') {
  const before = Object.fromEntries(BRAND_FILES.map((k) => [k, data.brand[k].before]));
  const after = Object.fromEntries(BRAND_FILES.map((k) => [k, data.brand[k].after]));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Clink art before and after</title>
<style>
:root { --base:#F6F8F9; --ink:#17202A; --ink2:#4A5563; --line:#D5DCE2; --cobalt:#2443A6; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--base); color: var(--ink); font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
header { padding: 24px 24px 16px; border-top: 6px solid var(--cobalt); border-bottom: 1px solid var(--line); }
header h1 { margin: 0 0 4px; font-size: 24px; }
header p { margin: 0; color: var(--ink2); max-width: 80ch; }
main { padding: 0 24px 40px; }
h2 { font-size: 19px; margin: 28px 0 6px; padding-top: 10px; border-top: 1px solid var(--line); }
h3 { font-size: 15px; margin: 16px 0 8px; }
figure { margin: 0; }
figcaption { font-size: 12px; color: var(--ink2); padding: 4px 2px; }
.pair { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.tile { display: flex; align-items: center; justify-content: center; padding: 4px; }
.crops .row { display: flex; gap: 6px; margin-bottom: 6px; }
.crops .tile { padding: 8px; }
.none { display: inline-flex; align-items: center; justify-content: center; color: var(--ink2); font-size: 12px; min-height: 29px; border: 1px dashed var(--line); }
.brand-grid { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.home { display: grid; grid-template-columns: repeat(4, 60px); gap: 18px 22px; padding: 22px; background: #44607A; }
.app { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #FFFFFF; font-size: 11px; }
.squircle { width: 60px; height: 60px; border-radius: 13.4px; display: block; }
.squircle29 { width: 29px; height: 29px; border-radius: 6.5px; display: block; }
.dark-home { display: flex; gap: 20px; padding: 22px; background: #000000; }
.tinted { display: inline-flex; width: 60px; height: 60px; border-radius: 13.4px; background: #3A2A10; filter: sepia(1) saturate(3); overflow: hidden; }
.settings { width: 300px; }
.setting { display: flex; align-items: center; gap: 12px; padding: 8px 14px; font-size: 15px; border-bottom: 1px solid #8883; }
.android { display: flex; flex-wrap: wrap; gap: 14px; padding: 14px; background: #DDDDDD; align-items: center; }
.adaptive { width: 60px; height: 60px; background: #2443A6; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; }
.adaptive img, .adaptive .mask { flex: none; }
.circle { border-radius: 50%; }
.rounded { border-radius: 16px; }
.mask { display: inline-block; -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; }
.notif { display: inline-flex; gap: 8px; align-items: center; padding: 8px 12px; font-size: 13px; }
.marks { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; padding: 16px; background: #FFFFFF; }
@media (max-width: 600px) { header, main { padding-left: 16px; padding-right: 16px; } .pair img { max-width: 100%; height: auto; } }
</style>
</head>
<body>
<header>
<h1>Clink art: before and after</h1>
<p>Before is <code>${ref}</code>, after is the working tree. Generated by <code>scripts/gen-art-gallery-compare.mjs</code>. Dark tints use the export rule from <code>docs/build-notes/art-a.md</code> (contour to #EEF2F5, gleam at 70%).</p>
</header>
<main>
<h2>Heroes</h2>
${heroRows(data.heroes)}
<h2>App icon and mark</h2>
${brandBlock('Before: the notched ring', before, data.wordmark)}
${brandBlock('After: the rim from above', after, data.wordmark)}
</main>
</body>
</html>
`;
}

async function screenshot(htmlFile, pngFile) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(pathToFileURL(htmlFile).href);
    await page.waitForLoadState('load');
    await page.screenshot({ path: pngFile, fullPage: true });
  } finally {
    await browser.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  let ref = 'HEAD';
  let png;
  let out = path.join(ROOT, 'docs/art/before-after.html');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ref') ref = argv[++i];
    else if (argv[i] === '--png') png = path.resolve(argv[++i]);
    else if (argv[i] === '--out') out = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  const html = buildCompare(collect(ref), ref);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`compare: ${path.relative(process.cwd(), out)} (before = ${ref})`);
  if (png) {
    await screenshot(out, png);
    console.log(`png: ${path.relative(process.cwd(), png)}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
