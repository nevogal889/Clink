// Tests for scripts/gen-art-gallery.mjs and the art it checks.
// Run: node --test scripts/gen-art-gallery.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CATEGORIES,
  allowedColours,
  buildGallery,
  checkSvg,
  collectArt,
  contrast,
  darkHero,
  main,
  shadeOf,
  swapAll,
  swapContour,
} from './gen-art-gallery.mjs';
import { BRAND_FILES, buildCompare } from './gen-art-gallery-compare.mjs';
import { buildBrand, rimGeometry } from '../app/assets/art/brand/_source/draw-brand.mjs';
import { buildHeroes } from '../app/assets/art/heroes/_source/draw-heroes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'app/assets/art');
const read = (rel) => fs.readFileSync(path.join(ART, rel), 'utf8');
const errors = (issues) => issues.filter((i) => i.level === 'error');

const CLEAN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="6" ry="1.8" fill="#F4F6F7" stroke="#4B3527"/></svg>';

test('shade tone is 12 L* darker and matches the heroes', () => {
  assert.equal(shadeOf('#EEF0EE'), '#CCCECC');
  assert.equal(shadeOf('#F4F6F7'), '#D2D4D5');
  assert.equal(shadeOf('#B8641E'), '#944700');
});

test('contrast matches DESIGN.md 2.1 (ink.primary on surface.base is 15.4:1)', () => {
  assert.equal(contrast('#17202A', '#F6F8F9').toFixed(1), '15.4');
});

test('swapContour swaps only inside contour elements, including nested groups', () => {
  const svg =
    '<svg><ellipse fill="#17202A"/><g id="contour" fill="#17202A"><g><path stroke="#17202A"/></g><path fill="#17202A"/></g>' +
    '<path id="contour-leaf" fill="#17202A"/><circle fill="#17202A"/></svg>';
  const out = swapContour(svg);
  assert.equal(out.match(/#EEF2F5/g).length, 4);
  assert.ok(out.startsWith('<svg><ellipse fill="#17202A"/>'), 'shadow keeps steel');
  assert.ok(out.endsWith('<circle fill="#17202A"/></svg>'), 'speckle keeps steel');
});

test('darkHero lowers the gleam to 70% and swapAll swaps every outline', () => {
  const svg =
    '<svg><path stroke="#FFFFFF" stroke-opacity="0.85"/><path fill="#FFFFFF" fill-opacity="0.85"/></svg>';
  assert.equal(darkHero(svg).match(/opacity="0\.7"/g).length, 2);
  assert.equal(
    swapAll('<path stroke="#17202A" fill="#17202a"/>'),
    '<path stroke="#EEF2F5" fill="#EEF2F5"/>',
  );
});

test('checkSvg passes clean drink art', () => {
  assert.deepEqual(checkSvg(CLEAN_ICON, 'icons/coffee.americano.24.svg'), []);
});

test('checkSvg refuses rasters, text, classes, styles, gradients, off-palette colour and bad viewBox', () => {
  const cases = [
    [CLEAN_ICON.replace('</svg>', '<image href="x.png"/></svg>'), /<image>/],
    [CLEAN_ICON.replace('</svg>', '<text>hi</text></svg>'), /<text>/],
    [CLEAN_ICON.replace('<ellipse', '<ellipse class="a"'), /classes/],
    [CLEAN_ICON.replace('<ellipse', '<ellipse style="fill:red"'), /style/],
    [CLEAN_ICON.replace('</svg>', '<linearGradient id="g"/></svg>'), /gradient/],
    [CLEAN_ICON.replace('#F4F6F7', '#7F00FF'), /not in the illustration palette/],
    [CLEAN_ICON.replace('fill="#F4F6F7"', 'fill="red"'), /literal hex/],
    [CLEAN_ICON.replace('0 0 24 24', '0 0 32 32'), /viewBox/],
  ];
  for (const [svg, pattern] of cases) {
    const found = errors(checkSvg(svg, 'icons/coffee.americano.24.svg'));
    assert.ok(
      found.some((i) => pattern.test(i.message)),
      `${pattern} not reported: ${JSON.stringify(found)}`,
    );
  }
});

test('checkSvg warns (does not fail) on ellipses that are not 0.30', () => {
  const svg = CLEAN_ICON.replace('ry="1.8"', 'ry="3"');
  const issues = checkSvg(svg, 'icons/coffee.americano.24.svg');
  assert.equal(errors(issues).length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /ratio 0\.50/);
});

test('brand files skip the palette rule but keep the structural rules', () => {
  const brand = '<svg viewBox="0 0 100 100"><rect fill="#2443A6"/></svg>';
  assert.deepEqual(checkSvg(brand, 'brand/x.svg'), []);
  assert.equal(
    errors(checkSvg(brand.replace('<rect', '<text>x</text><rect'), 'brand/x.svg')).length,
    1,
  );
});

test('the five heroes and five glyphs exist and pass every check without warnings', () => {
  const allowed = allowedColours();
  for (const kind of ['heroes', 'glyphs']) {
    for (const cat of CATEGORIES) {
      const rel = `${kind}/${cat}.svg`;
      assert.deepEqual(checkSvg(read(rel), rel, allowed), [], rel);
    }
  }
});

test('heroes follow DESIGN.md 3.2: 8 px contour, 14 px rim line, contour group, transparent artboard', () => {
  for (const cat of CATEGORIES) {
    const svg = read(`heroes/${cat}.svg`);
    assert.match(svg, /id="contour/, `${cat}: contour group`);
    assert.match(svg, /stroke-width="14"/, `${cat}: rim line`);
    assert.doesNotMatch(svg, /<rect[^>]*width="1024"/, `${cat}: no background`);
    assert.match(svg, /fill="#17202A" fill-opacity="0.14"/, `${cat}: cast shadow`);
  }
});

test('glyphs are one colour, no fills, 1.75 stroke with round caps and joins', () => {
  for (const cat of CATEGORIES) {
    const svg = read(`glyphs/${cat}.svg`);
    const colours = new Set(
      [...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]),
    );
    assert.deepEqual([...colours], ['#17202A'], cat);
    assert.doesNotMatch(svg, /fill="#/, `${cat}: no fills`);
    assert.match(svg, /stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/, cat);
  }
});

test('brand set is complete and passes the structural checks', () => {
  const names = [
    'mark',
    'mark-small',
    'mark-mono',
    'wordmark',
    'wordmark-dark',
    'wordmark-mono',
    'lockup',
    'app-icon',
    'app-icon-dark',
    'app-icon-mono',
    'android-adaptive-foreground',
    'android-monochrome',
    'android-notification',
  ];
  for (const name of names) {
    const rel = `brand/${name}.svg`;
    assert.deepEqual(checkSvg(read(rel), rel), [], rel);
  }
  assert.match(read('brand/app-icon.svg'), /viewBox="0 0 1024 1024"/);
  assert.match(read('brand/app-icon.svg'), /<rect width="1024" height="1024" fill="#2443A6"\/>/);
  assert.doesNotMatch(read('brand/app-icon-mono.svg'), /<rect/);
});

test('brand and hero SVGs match their generators (no hand edits)', () => {
  for (const [name, svg] of Object.entries(buildBrand())) {
    assert.equal(read(`brand/${name}`), svg, `brand/${name}: rerun draw-brand.mjs`);
  }
  for (const [name, svg] of Object.entries(buildHeroes())) {
    assert.equal(read(`heroes/${name}`), svg, `heroes/${name}: rerun draw-heroes.mjs`);
  }
});

test('the mark is a rim seen from above, not a ring with a notch (DECISIONS.md, art review)', () => {
  const { outer, open, drink } = rimGeometry();
  const ratio = outer.ry / outer.rx;
  assert.ok(ratio > 0.45 && ratio < 0.6, `outer ratio ${ratio} reads as an ellipse, not an O`);
  const front = outer.ry - (open.cy + open.ry);
  const back = outer.ry - (open.ry - open.cy);
  assert.ok(front > back, 'near lip is heavier than the back lip');
  assert.ok(
    drink.cy > open.cy && drink.rx < open.rx,
    'drink sits low in the opening: back wall shows',
  );
  // Every mark file draws a closed band: two full ellipses under one fill rule, no open arc.
  for (const name of ['mark', 'mark-small', 'mark-mono', 'app-icon', 'android-notification']) {
    const svg = read(`brand/${name}.svg`);
    assert.doesNotMatch(svg, /stroke-width/, `${name}: filled shapes only`);
    assert.equal((svg.match(/A[\d.]+ [\d.]+ 0 1 0/g) ?? []).length >= 4, true, name);
  }
});

test('one-colour brand files survive a flat system tint', () => {
  for (const name of ['android-notification', 'android-monochrome', 'mark-mono']) {
    const svg = read(`brand/${name}.svg`);
    const colours = new Set([...svg.matchAll(/fill="(#[0-9A-F]{6})"/g)].map((m) => m[1]));
    assert.equal(colours.size, 1, `${name}: one colour`);
    assert.doesNotMatch(svg, /opacity/, `${name}: no opacity`);
    assert.equal((svg.match(/<path/g) ?? []).length, 1, `${name}: one silhouette`);
  }
});

test('compare page shows before and after for every hero and the app icon', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"></svg>';
  const pair = { before: svg, after: svg };
  const data = {
    heroes: Object.fromEntries(CATEGORIES.map((c) => [c, pair])),
    brand: Object.fromEntries(
      BRAND_FILES.map((b) => [b, b === 'android-monochrome' ? { after: svg } : pair]),
    ),
  };
  const html = buildCompare(data, 'abc123');
  assert.match(html, /<title>Clink art before and after<\/title>/);
  assert.match(html, /abc123/);
  assert.equal((html.match(/<section class="hero-row">/g) ?? []).length, 5);
  assert.match(html, /Before: the notched ring/);
  assert.match(html, /After: the rim from above/);
  assert.match(html, /Settings row, 29 pt/);
  assert.match(html, /Home screen, 60 pt/);
});

test('gallery lists every SVG, skips _source folders, and --check fails only on errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-gallery-'));
  const art = path.join(dir, 'art');
  fs.mkdirSync(path.join(art, 'icons/_source'), { recursive: true });
  fs.mkdirSync(path.join(art, 'heroes'), { recursive: true });
  fs.writeFileSync(path.join(art, 'icons/coffee.americano.24.svg'), CLEAN_ICON);
  fs.writeFileSync(path.join(art, 'icons/_source/draft.svg'), CLEAN_ICON);
  fs.writeFileSync(path.join(art, 'heroes/coffee.svg'), read('heroes/coffee.svg'));

  const items = collectArt(art);
  assert.deepEqual(
    items.map((i) => i.rel),
    ['heroes/coffee.svg', 'icons/coffee.americano.24.svg'],
  );
  const html = buildGallery(items);
  assert.match(html, /<title>Clink art gallery<\/title>/);
  assert.match(html, /coffee\.americano/);
  assert.match(html, /Heroes \(1\)/);

  const out = path.join(dir, 'gallery.html');
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['--art', art, '--out', out, '--check']), 0);
    assert.ok(fs.readFileSync(out, 'utf8').includes('coffee.americano'));
    fs.writeFileSync(
      path.join(art, 'icons/coffee.mocha.24.svg'),
      CLEAN_ICON.replace('#F4F6F7', '#7F00FF'),
    );
    assert.equal(await main(['--art', art, '--out', out, '--check']), 1);
    assert.equal(await main(['--art', art, '--out', out]), 0);
  } finally {
    console.log = log;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
