#!/usr/bin/env node
// Android vector drawables for the native widget, from the SVG masters in app/assets/art.
//
//   node scripts/gen-drink-assets.mjs           write app/assets/native/android/res/drawable{,-night}/clink_*.xml
//   node scripts/gen-drink-assets.mjs --check   exit 1 if any file is missing, stale or extra
//
// What it makes (DESIGN.md 3.6 sizes, 3.5 dark rules, 2.8 UI glyphs):
// - clink_icon_<category>_<slug>: Icon S (24 grid) for every catalog drink, light and night.
// - clink_icon_l_<category>_<slug>: Icon L (64 grid: shade tone and gleam), for the widget's drink
//   panel, picker cells and confirmation (40 dp and up, DESIGN.md 3.2), light and night. The
//   viewport is cropped to the drawn bounds plus 1 unit, so a short cup and a tall glass both fill
//   their box; the widget reads each picture's aspect from its intrinsic size.
// - clink_hero_<category>: the five heroes, light and night (night swaps only the contour outline).
// - clink_glyph_<category>[_ink|_on_solid]: category glyphs in ink.primary, category ink, onSolid.
// - clink_ui_<name>[_variant]: the few UI glyphs the widget draws (DESIGN.md 2.8 shapes).
// - clink_wordmark, clink_mark: brand art for the signed-out state (the mark has a night variant:
//   rim #9DB2F2, back wall cobalt, as the dark app icon in DESIGN.md 1.3).
// Every SVG feature the masters use maps to VectorDrawable: path, circle, ellipse, rect (with rx),
// group fill/stroke inheritance, fill/stroke opacity, even-odd fill, translate and rotate. Anything
// else fails the run, so a new feature in the art can't be dropped silently.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT, writeOrCheck } from '../packages/shared/tools/copy-md.mjs';
import { darkIcon } from '../app/assets/art/icons/_source/dark-icon.mjs';

const ART = join(REPO_ROOT, 'app/assets/art');
export const RES = join(REPO_ROOT, 'app/assets/native/android/res');
const CATEGORIES = ['coffee', 'matcha', 'tea', 'smoothie_juice', 'water'];

// ---------------------------------------------------------------------------------------------
// Dark-mode rules. Icons: the shared rule in app/assets/art/icons/_source/dark-icon.mjs (a light
// contour around the silhouette, round 3), which the app's art.ts is to use too. Heroes: same as
// darkHero in app/src/ui/art/art.ts. Both driven by icons/theme.json.

const THEME = JSON.parse(readFileSync(join(ART, 'icons/theme.json'), 'utf8'));
const OUTLINE = { light: '#17202A', dark: '#EEF2F5' };
export { darkIcon };

function swapGleam(svg) {
  const { light, dark } = THEME.gleamOpacity;
  return svg.replace(
    new RegExp(`((?:fill|stroke)-opacity=")${light.replace('.', '\\.')}(")`, 'g'),
    `$1${dark}$2`,
  );
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

// ---------------------------------------------------------------------------------------------
// Drawn bounds, so a drink picture can be cropped to what is drawn (polish pass: a flat white
// fills only a third of its 64 grid, so at widget sizes the cup came out tiny next to a tall glass).

/** Points along one path `d` (absolute and relative M L H V C Q A Z), sampled finely enough for bounds. */
export function samplePath(d) {
  const toks = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const pts = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const n = () => num(toks[i++], 'path');
  const STEPS = 24;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'Z') {
      x = sx;
      y = sy;
      pts.push([x, y]);
      continue;
    }
    if (C === 'M' || C === 'L') {
      x = ox + n();
      y = oy + n();
      if (C === 'M') {
        sx = x;
        sy = y;
        cmd = rel ? 'l' : 'L';
      }
      pts.push([x, y]);
    } else if (C === 'H') {
      x = (rel ? x : 0) + n();
      pts.push([x, y]);
    } else if (C === 'V') {
      y = (rel ? y : 0) + n();
      pts.push([x, y]);
    } else if (C === 'C' || C === 'Q') {
      const c = [];
      for (let k = 0; k < (C === 'C' ? 3 : 2); k++) c.push([ox + n(), oy + n()]);
      const p = [[x, y], ...c];
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        let q = p;
        while (q.length > 1)
          q = q
            .slice(1)
            .map((b, k) => [q[k][0] + (b[0] - q[k][0]) * t, q[k][1] + (b[1] - q[k][1]) * t]);
        pts.push(q[0]);
      }
      [x, y] = c[c.length - 1];
    } else if (C === 'A') {
      let rx = Math.abs(n());
      let ry = Math.abs(n());
      const phi = (n() * Math.PI) / 180;
      const large = n() !== 0;
      const sweep = n() !== 0;
      const x2 = ox + n();
      const y2 = oy + n();
      // SVG arc endpoint to centre parameterisation (SVG 1.1 implementation notes F.6.5).
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const dx = (x - x2) / 2;
      const dy = (y - y2) / 2;
      const x1p = cos * dx + sin * dy;
      const y1p = -sin * dx + cos * dy;
      const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
      if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
      }
      const numr = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
      const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
      let co = Math.sqrt(Math.max(0, numr / den));
      if (large === sweep) co = -co;
      const cxp = (co * rx * y1p) / ry;
      const cyp = (-co * ry * x1p) / rx;
      const cx = cos * cxp - sin * cyp + (x + x2) / 2;
      const cy = sin * cxp + cos * cyp + (y + y2) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI;
      if (sweep && dt < 0) dt += 2 * Math.PI;
      for (let s = 1; s <= STEPS * 2; s++) {
        const t = t1 + (dt * s) / (STEPS * 2);
        pts.push([
          cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
          cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
        ]);
      }
      x = x2;
      y = y2;
    } else {
      throw new Error(`svg: unsupported path command ${cmd}`);
    }
  }
  return pts;
}

/**
 * The drawn bounds of an SVG, strokes included: [minX, minY, maxX, maxY] in viewBox units.
 * Group and shape transforms (translate, rotate) are applied, like the conversion does.
 */
export function drawnBounds(src) {
  const svg = parseSvg(src);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const apply = (p, transform) => {
    let [px, py] = p;
    // An SVG transform list applies right to left to the point.
    for (const g of groupAttrs(transform).reverse()) {
      if ('translateX' in g) {
        px += g.translateX;
        py += g.translateY;
      } else {
        const a = (g.rotation * Math.PI) / 180;
        const qx = px - g.pivotX;
        const qy = py - g.pivotY;
        px = g.pivotX + qx * Math.cos(a) - qy * Math.sin(a);
        py = g.pivotY + qx * Math.sin(a) + qy * Math.cos(a);
      }
    }
    return [px, py];
  };
  const walk = (node, style, transforms) => {
    for (const child of node.children) {
      const own = { ...style };
      for (const k of INHERITED) if (child.attrs[k] !== undefined) own[k] = child.attrs[k];
      const tf = child.attrs.transform ? [child.attrs.transform, ...transforms] : transforms;
      if (child.name === 'g') {
        walk(child, own, tf);
        continue;
      }
      if (!SHAPES.has(child.name)) continue;
      const fill = own.fill ?? '#000000';
      const stroke = own.stroke ?? 'none';
      if (fill === 'none' && stroke === 'none') continue;
      const half = stroke === 'none' ? 0 : num(own['stroke-width'] ?? 1, 'stroke-width') / 2;
      for (let p of samplePath(shapePath(child))) {
        for (const t of tf) p = apply(p, t);
        b[0] = Math.min(b[0], p[0] - half);
        b[1] = Math.min(b[1], p[1] - half);
        b[2] = Math.max(b[2], p[0] + half);
        b[3] = Math.max(b[3], p[1] + half);
      }
    }
  };
  walk(svg, {}, []);
  return b;
}

/** A viewBox tight around the drawing, with `margin` units on every side, kept inside the original grid. */
export function cropViewBox(src, margin) {
  const svg = parseSvg(src);
  const [vx, vy, vw, vh] = (svg.attrs.viewBox ?? `0 0 ${svg.attrs.width} ${svg.attrs.height}`)
    .trim()
    .split(/[\s,]+/)
    .map((v) => num(v, 'viewBox'));
  const [x0, y0, x1, y1] = drawnBounds(src);
  const r = (v) => Math.round(v * 100) / 100;
  const minX = r(Math.max(vx, Math.floor((x0 - margin) * 4) / 4));
  const minY = r(Math.max(vy, Math.floor((y0 - margin) * 4) / 4));
  const maxX = r(Math.min(vx + vw, Math.ceil((x1 + margin) * 4) / 4));
  const maxY = r(Math.min(vy + vh, Math.ceil((y1 + margin) * 4) / 4));
  return [minX, minY, r(maxX - minX), r(maxY - minY)];
}

/** SVG text to VectorDrawable XML, drawn at `sizeDp` on its longer side (`viewBox` overrides the SVG's). */
export function svgToVector(src, { sizeDp, source, viewBox }) {
  const svg = parseSvg(src);
  const vb =
    viewBox ??
    (svg.attrs.viewBox ?? `0 0 ${svg.attrs.width} ${svg.attrs.height}`)
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
    const large = read(`icons/${id}.64.svg`);
    // Cropped to what is drawn (1 unit of air), so every drink fills its box in the widget: the
    // picture is the main thing in a picker cell and on the drink panel (polish pass). The crop
    // is taken from the dark variant, whose contour reaches furthest, so light and dark share
    // one viewport.
    const viewBox = cropViewBox(darkIcon(large), 1);
    both(`clink_icon_l_${id.replace(/\./g, '_')}`, large, darkIcon(large), {
      sizeDp: 64 * (Math.max(viewBox[2], viewBox[3]) / 64),
      source: `app/assets/art/icons/${id}.64.svg (cropped to ${viewBox.join(' ')})`,
      viewBox,
    });
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
    ['camera', 'cobalt'],
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
  const markDark = mark
    .split('#2443A6')
    .join('#RIM')
    .split('#9DB2F2')
    .join('#2443A6')
    .split('#RIM')
    .join('#9DB2F2')
    .split('#FFFFFF')
    .join('#EEF2F5');
  both('clink_mark', mark, markDark, { sizeDp: 32, source: 'app/assets/art/brand/mark.svg' });
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
  const rowsL = ids.map(
    (id) => `      "${id}" -> R.drawable.clink_icon_l_${id.replace(/\./g, '_')}`,
  );
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
    '',
    '  /** Icon L (64 grid, shade and gleam) for a catalog drink id, or null for a custom drink. */',
    '  fun iconL(drinkId: String?): Int? =',
    '    when (drinkId) {',
    ...rowsL,
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
