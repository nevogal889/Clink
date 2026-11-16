#!/usr/bin/env node
// Android vector drawables for the native widget, from the SVG masters in app/assets/art.
//
//   node scripts/gen-drink-assets.mjs           write app/assets/native/android/res/drawable{,-night}/clink_*.xml
//   node scripts/gen-drink-assets.mjs --check   exit 1 if any file is missing, stale or extra
//
// What it makes (DESIGN.md 3.6 sizes, 3.5 dark rules, 2.8 UI glyphs):
// - clink_icon_<category>_<slug>: Icon S (24 grid) for every catalog drink, light and night.
// - clink_hero_<category>: the five heroes, light and night (night swaps only the contour outline).
// - clink_glyph_<category>[_ink|_on_solid]: category glyphs in ink.primary, category ink, onSolid.
// - clink_ui_<name>[_variant]: the few UI glyphs the widget draws (DESIGN.md 2.8 shapes).
// - clink_wordmark, clink_mark: brand art for the signed-out state.
// Every SVG feature the masters use maps to VectorDrawable: path, circle, ellipse, rect (with rx),
// group fill/stroke inheritance, fill/stroke opacity, even-odd fill, translate and rotate. Anything
// else fails the run, so a new feature in the art can't be dropped silently.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT, writeOrCheck } from '../packages/shared/tools/copy-md.mjs';

const ART = join(REPO_ROOT, 'app/assets/art');
export const RES = join(REPO_ROOT, 'app/assets/native/android/res');
const CATEGORIES = ['coffee', 'matcha', 'tea', 'smoothie_juice', 'water'];

// ---------------------------------------------------------------------------------------------
// Dark-mode rules. Same as app/src/ui/art/art.ts (darkHero, darkIcon), driven by icons/theme.json.

const THEME = JSON.parse(readFileSync(join(ART, 'icons/theme.json'), 'utf8'));
const OUTLINE = { light: '#17202A', dark: '#EEF2F5' };

function swapGleam(svg) {
  const { light, dark } = THEME.gleamOpacity;
  return svg.replace(
    new RegExp(`((?:fill|stroke)-opacity=")${light.replace('.', '\\.')}(")`, 'g'),
    `$1${dark}$2`,
  );
}

export function darkIcon(svg) {
  let out = svg;
  for (const [from, to] of Object.entries(THEME.dark)) {
    out = out.split(from).join(to).split(from.toLowerCase()).join(to);
  }
  return swapGleam(out);
}

export function darkHero(svg) {
  let depth = 0;
  const swapped = svg.replace(
    /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g,
    (tag, close, _name, attrs, self) => {
      if (depth > 0) {
        if (close) depth -= 1;
        else if (!self) depth += 1;
        return tag.split(OUTLINE.light).join(OUTLINE.dark);
      }
      if (!close && /\bid="contour/.test(attrs)) {
        if (!self) depth = 1;
        return tag.split(OUTLINE.light).join(OUTLINE.dark);
      }
      return tag;
    },
  );
  return swapGleam(swapped);
}

// ---------------------------------------------------------------------------------------------
// SVG parsing

export function parseSvg(src) {
  const text = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/g, '');
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, rawAttrs, self] = m;
    if (close) {
      const top = stack.pop();
      if (!top || top.name !== name) throw new Error(`svg: unexpected </${name}>`);
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!self) stack.push(node);
  }
  const svg = root.children.find((c) => c.name === 'svg');
  if (!svg) throw new Error('svg: no <svg> element');
  return svg;
}

const INHERITED = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
];
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect']);
const KNOWN_ATTRS = new Set([
  ...INHERITED,
  'id',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'transform',
  'xmlns',
  'viewBox',
]);

const num = (v, what) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`svg: ${what} is not a number: ${v}`);
  return n;
};
const fmt = (n) => String(Math.round(n * 1000) / 1000);

function ellipsePath(cx, cy, rx, ry) {
  return (
    `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)}` +
    `A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}Z`
  );
}

function rectPath(a) {
  const x = num(a.x ?? 0, 'x');
  const y = num(a.y ?? 0, 'y');
  const w = num(a.width, 'width');
  const h = num(a.height, 'height');
  let rx = a.rx !== undefined ? num(a.rx, 'rx') : a.ry !== undefined ? num(a.ry, 'ry') : 0;
  let ry = a.ry !== undefined ? num(a.ry, 'ry') : rx;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx === 0 || ry === 0) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`;
  const arc = (dx, dy) => `a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`;
  return (
    `M${fmt(x + rx)} ${fmt(y)}h${fmt(w - 2 * rx)}${arc(rx, ry)}v${fmt(h - 2 * ry)}` +
    `${arc(-rx, ry)}h${fmt(-(w - 2 * rx))}${arc(-rx, -ry)}v${fmt(-(h - 2 * ry))}${arc(rx, -ry)}Z`
  );
}

function shapePath(node) {
  const a = node.attrs;
  switch (node.name) {
    case 'path':
      return a.d;
    case 'circle': {
      const r = num(a.r, 'r');
      return ellipsePath(num(a.cx ?? 0, 'cx'), num(a.cy ?? 0, 'cy'), r, r);
    }
    case 'ellipse':
      return ellipsePath(
        num(a.cx ?? 0, 'cx'),
        num(a.cy ?? 0, 'cy'),
        num(a.rx, 'rx'),
        num(a.ry, 'ry'),
      );
    case 'rect':
      return rectPath(a);
    default:
      throw new Error(`svg: unsupported element <${node.name}>`);
  }
}

/** One SVG transform attribute as VectorDrawable group attributes. */
function groupAttrs(transform) {
  const out = [];
  for (const m of transform.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const args = m[2]
      .trim()
      .split(/[\s,]+/)
      .map((v) => num(v, m[1]));
    if (m[1] === 'translate') {
      out.push({ translateX: args[0] ?? 0, translateY: args[1] ?? 0 });
    } else if (m[1] === 'rotate') {
      out.push({ rotation: args[0] ?? 0, pivotX: args[1] ?? 0, pivotY: args[2] ?? 0 });
    } else {
      throw new Error(`svg: unsupported transform ${m[1]}()`);
    }
  }
  return out;
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function color(v, what) {
  if (!COLOR_RE.test(v)) throw new Error(`svg: unsupported ${what} colour "${v}"`);
  return v.toUpperCase();
}

function pathElement(node, style, indent) {
  const attrs = [`android:pathData="${shapePath(node).replace(/\s+/g, ' ').trim()}"`];
  const fill = style.fill ?? '#000000';
  if (fill !== 'none') {
    attrs.push(`android:fillColor="${color(fill, 'fill')}"`);
    if (style['fill-opacity'] !== undefined && Number(style['fill-opacity']) !== 1) {
      attrs.push(`android:fillAlpha="${fmt(num(style['fill-opacity'], 'fill-opacity'))}"`);
    }
    if (style['fill-rule'] === 'evenodd') attrs.push('android:fillType="evenOdd"');
  }
  const stroke = style.stroke ?? 'none';
  if (stroke !== 'none') {
    attrs.push(`android:strokeColor="${color(stroke, 'stroke')}"`);
    attrs.push(`android:strokeWidth="${fmt(num(style['stroke-width'] ?? 1, 'stroke-width'))}"`);
    if (style['stroke-opacity'] !== undefined && Number(style['stroke-opacity']) !== 1) {
      attrs.push(`android:strokeAlpha="${fmt(num(style['stroke-opacity'], 'stroke-opacity'))}"`);
    }
    const cap = style['stroke-linecap'];
    if (cap && cap !== 'butt') attrs.push(`android:strokeLineCap="${cap}"`);
    const join = style['stroke-linejoin'];
    if (join && join !== 'miter') attrs.push(`android:strokeLineJoin="${join}"`);
  }
  if (fill === 'none' && stroke === 'none') return [];
  return [`${indent}<path ${attrs.join(' ')} />`];
}

function convertChildren(node, style, indent) {
  const lines = [];
  for (const child of node.children) {
    for (const k of Object.keys(child.attrs)) {
      if (!KNOWN_ATTRS.has(k))
        throw new Error(`svg: unsupported attribute ${k} on <${child.name}>`);
    }
    const own = { ...style };
    for (const k of INHERITED) if (child.attrs[k] !== undefined) own[k] = child.attrs[k];
    const groups = child.attrs.transform ? groupAttrs(child.attrs.transform) : [];
    let inner;
    if (child.name === 'g') {
      inner = convertChildren(child, own, indent + '  '.repeat(groups.length));
    } else if (SHAPES.has(child.name)) {
      inner = pathElement(child, own, indent + '  '.repeat(groups.length));
    } else {
      throw new Error(`svg: unsupported element <${child.name}>`);
    }
    if (inner.length === 0) continue;
    // Nested groups apply outer first, like an SVG transform list read left to right.
    let wrapped = inner;
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      const attrs = Object.entries(g)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `android:${k}="${fmt(v)}"`)
        .join(' ');
      const pad = indent + '  '.repeat(i);
      wrapped = [`${pad}<group${attrs ? ' ' + attrs : ''}>`, ...wrapped, `${pad}</group>`];
    }
    lines.push(...wrapped);
  }
  return lines;
}

/** SVG text to VectorDrawable XML, drawn at `sizeDp` on its longer side. */
export function svgToVector(src, { sizeDp, source }) {
  const svg = parseSvg(src);
  const vb = (svg.attrs.viewBox ?? `0 0 ${svg.attrs.width} ${svg.attrs.height}`)
    .trim()
    .split(/[\s,]+/)
    .map((v) => num(v, 'viewBox'));
  const [minX, minY, w, h] = vb;
  const scale = sizeDp / Math.max(w, h);
  const body = convertChildren(svg, {}, minX || minY ? '    ' : '  ');
  const content =
    minX || minY
      ? [
          `  <group android:translateX="${fmt(-minX)}" android:translateY="${fmt(-minY)}">`,
          ...body,
          '  </group>',
        ]
      : body;
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<!-- GENERATED by scripts/gen-drink-assets.mjs from ${source}. Do not edit. -->`,
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    `    android:width="${fmt(w * scale)}dp"`,
    `    android:height="${fmt(h * scale)}dp"`,
    `    android:viewportWidth="${fmt(w)}"`,
    `    android:viewportHeight="${fmt(h)}">`,
    ...content,
    '</vector>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// UI glyphs (DESIGN.md 2.8): 24 grid, 1.75 stroke, round caps and joins. Same drawings as
// app/src/ui/icons.tsx, which stands in for Material Symbols in the review build.

const UI_GLYPHS = {
  plus: [{ d: 'M12 5v14M5 12h14', sw: 2 }],
  close: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5', sw: 2.25 }],
  camera: [
    {
      d: 'M3.5 8.5A1.5 1.5 0 0 1 5 7h2.6l1.6-2.2h5.6L16.4 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
    },
    { d: ellipsePath(12, 12.8, 3.4, 3.4) },
  ],
  share: [{ d: 'M12 3.5v11M8 7.5l4-4 4 4' }, { d: 'M8.5 10.5H6.5v10h11v-10h-2' }],
  // Sending (DESIGN.md 5.2): a plain clock face, same stroke rules.
  clock: [{ d: ellipsePath(12, 12, 8.5, 8.5) }, { d: 'M12 7.5V12l3 2' }],
  // Water counter (DESIGN.md 2.8): V4 tumbler with a water line.
  tumbler: [
    { d: ellipsePath(12, 5.5, 6.5, 1.95) },
    { d: 'M5.5 5.5l1.4 13a5.1 1.5 0 0 0 10.2 0l1.4-13' },
    { d: 'M6.4 11.2a5.8 1.6 0 0 0 11.2 0' },
  ],
};

function uiGlyphSvg(name, hex) {
  const parts = UI_GLYPHS[name]
    .map(
      (p) =>
        `<path d="${p.d}" fill="none" stroke="${hex}" stroke-width="${p.sw ?? 1.75}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${parts}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// The asset list

function tokens() {
  // Lazy: the colour generator owns token parsing.
  return import('./gen-android-colors.mjs').then((m) => m.readTokens());
}

const read = (rel) => readFileSync(join(ART, rel), 'utf8');

/** Every output file: [path relative to RES, xml]. */
export async function buildAssets() {
  const t = await tokens();
  const out = [];
  const both = (name, light, dark, opts) => {
    out.push([`drawable/${name}.xml`, svgToVector(light, opts)]);
    out.push([`drawable-night/${name}.xml`, svgToVector(dark, opts)]);
  };

  // Icon S for every drink (DESIGN.md 3.6: pickers 28, idle line 16; drawn from the 24 grid).
  const icons = readdirSync(join(ART, 'icons'))
    .filter((f) => f.endsWith('.24.svg'))
    .sort();
  for (const f of icons) {
    const id = f.slice(0, -'.24.svg'.length);
    const name = `clink_icon_${id.replace(/\./g, '_')}`;
    const src = read(`icons/${f}`);
    both(name, src, darkIcon(src), { sizeDp: 24, source: `app/assets/art/icons/${f}` });
  }

  for (const cat of CATEGORIES) {
    const hero = read(`heroes/${cat}.svg`);
    both(`clink_hero_${cat}`, hero, darkHero(hero), {
      sizeDp: 96,
      source: `app/assets/art/heroes/${cat}.svg`,
    });
    const glyph = read(`glyphs/${cat}.svg`);
    const tint = (hex) => glyph.split(OUTLINE.light).join(hex);
    const opts = { sizeDp: 24, source: `app/assets/art/glyphs/${cat}.svg` };
    both(`clink_glyph_${cat}`, tint(t.light.inkPrimary), tint(t.dark.inkPrimary), opts);
    both(`clink_glyph_${cat}_ink`, tint(t.light[`${cat}_ink`]), tint(t.dark[`${cat}_ink`]), opts);
    both(
      `clink_glyph_${cat}_on_solid`,
      tint(t.light[`${cat}_onSolid`]),
      tint(t.dark[`${cat}_onSolid`]),
      opts,
    );
  }

  const ui = [
    ['plus', 'inkPrimary'],
    ['close', 'inkPrimary'],
    ['check', 'inkPrimary'],
    ['camera', 'inkPrimary'],
    ['camera', 'inkSecondary'],
    ['share', 'inkPrimary'],
    ['share', 'onCobalt'],
    ['clock', 'inkSecondary'],
    ['tumbler', 'water_ink'],
  ];
  for (const [glyph, token] of ui) {
    const suffix =
      token === 'inkPrimary' ? '' : `_${token.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}`;
    both(
      `clink_ui_${glyph}${suffix}`,
      uiGlyphSvg(glyph, t.light[token]),
      uiGlyphSvg(glyph, t.dark[token]),
      {
        sizeDp: 24,
        source: `scripts/gen-drink-assets.mjs UI_GLYPHS.${glyph}`,
      },
    );
  }

  both('clink_wordmark', read('brand/wordmark.svg'), read('brand/wordmark-dark.svg'), {
    sizeDp: 96,
    source: 'app/assets/art/brand/wordmark.svg',
  });
  const mark = read('brand/mark.svg');
  out.push([
    'drawable/clink_mark.xml',
    svgToVector(mark, { sizeDp: 32, source: 'app/assets/art/brand/mark.svg' }),
  ]);
  return out;
}

function generatedFiles(dir) {
  const full = join(RES, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => /^clink_(icon|hero|glyph|ui|wordmark|mark)\b.*\.xml$/.test(f))
    .map((f) => `${dir}/${f}`);
}

export const ICONS_KT = join(
  REPO_ROOT,
  'app/modules/clink-native/android/src/main/java/app/clink/widget/ui/DrinkIcons.kt',
);

/** Kotlin lookup from catalog drink id to its Icon S drawable, so no reflection is needed. */
export function buildIconsKotlin() {
  const ids = readdirSync(join(ART, 'icons'))
    .filter((f) => f.endsWith('.24.svg'))
    .map((f) => f.slice(0, -'.24.svg'.length))
    .sort();
  const rows = ids.map((id) => `      "${id}" -> R.drawable.clink_icon_${id.replace(/\./g, '_')}`);
  return [
    '// GENERATED by scripts/gen-drink-assets.mjs from app/assets/art/icons. Do not edit.',
    'package app.clink.widget.ui',
    '',
    'import app.clink.nativemodule.R',
    '',
    'object DrinkIcons {',
    '  /** Icon S (24 grid) for a catalog drink id, or null for a custom drink. */',
    '  fun iconS(drinkId: String?): Int? =',
    '    when (drinkId) {',
    ...rows,
    '      else -> null',
    '    }',
    '}',
    '',
  ].join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const assets = await buildAssets();
  const want = new Set(assets.map(([p]) => p));
  const kt = await writeOrCheck(ICONS_KT, buildIconsKotlin(), check);
  if (kt.stale) {
    console.error('stale: DrinkIcons.kt. Run: node scripts/gen-drink-assets.mjs');
    process.exit(1);
  }
  let stale = 0;
  for (const [rel, xml] of assets) {
    const r = await writeOrCheck(join(RES, rel), xml, check);
    if (r.stale) {
      console.error(`stale: ${rel}`);
      stale++;
    }
  }
  for (const rel of [...generatedFiles('drawable'), ...generatedFiles('drawable-night')]) {
    if (want.has(rel)) continue;
    if (check) {
      console.error(`extra: ${rel}`);
      stale++;
    } else {
      rmSync(join(RES, rel));
    }
  }
  if (stale) {
    console.error(`${stale} drawable(s) out of date. Run: node scripts/gen-drink-assets.mjs`);
    process.exit(1);
  }
  console.log(
    check ? `drink drawables up to date (${assets.length})` : `wrote ${assets.length} drawables`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
