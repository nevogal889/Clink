#!/usr/bin/env node
// Builds docs/art/gallery.html: every SVG under app/assets/art on light and dark surfaces, plus the
// automatic checks from DESIGN.md 3.3 and 3.5 (SVG rules, palette, ellipse ratio, contour contrast).
// Re-runnable: it shows whatever art exists when it runs.
//
//   node scripts/gen-art-gallery.mjs                    write docs/art/gallery.html
//   node scripts/gen-art-gallery.mjs --check            also exit 1 if any check fails
//   node scripts/gen-art-gallery.mjs --png out.png      also screenshot the page (needs Playwright)
//   node scripts/gen-art-gallery.mjs --art <dir> --out <file>   other locations (tests use this)

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------
// Design values (DESIGN.md 2.1, 2.2, 3.2). Kept here, not imported from the app, so the script
// runs with plain Node and no build step.

export const CATEGORIES = ['coffee', 'matcha', 'tea', 'smoothie_juice', 'water'];

export const CATEGORY_NAMES = {
  coffee: 'Coffee',
  matcha: 'Matcha',
  tea: 'Tea',
  smoothie_juice: 'Smoothie & Juice',
  water: 'Water',
};

// [light, dark] for tint and ink.
export const TINT = {
  coffee: ['#EFE6DF', '#2A211B'],
  matcha: ['#E3ECD8', '#1D2817'],
  tea: ['#F5EDCF', '#2A2512'],
  smoothie_juice: ['#F7E0EA', '#2F1823'],
  water: ['#DCEEF3', '#102A33'],
};
export const INK = {
  coffee: ['#4B3527', '#DDC1AE'],
  matcha: ['#36591A', '#B7D69A'],
  tea: ['#6B5306', '#E8CF78'],
  smoothie_juice: ['#9E2460', '#F5B0D0'],
  water: ['#085C74', '#99D9EB'],
};

export const SURFACE = { light: '#F6F8F9', dark: '#131A22' };
export const OUTLINE = { light: '#17202A', dark: '#EEF2F5' };

// Illustration palette, DESIGN.md 3.2.
export const PALETTE = [
  // bodies
  '#F4F6F7',
  '#EEF0EE',
  '#DCEEF3',
  '#2E3A2C',
  '#4C5E45',
  '#CDBFA6',
  '#8E9AA6',
  '#C9A86A',
  '#F5EDCF',
  '#17202A',
  // coffee
  '#3B2418',
  '#B77A45',
  '#4A2C1E',
  '#B88A64',
  '#F2EFEA',
  '#5A3322',
  '#4A2A1C',
  // matcha
  '#7BA23F',
  '#8CB24A',
  '#A9C96A',
  '#B5CB86',
  '#9A6B45',
  '#E0475A',
  // tea
  '#B8641E',
  '#C49470',
  '#C9C26A',
  '#D9C77A',
  '#C08A2E',
  '#B88660',
  '#E3C14F',
  '#A8C77A',
  '#B5482A',
  '#E7CF7A',
  '#6E7F3A',
  // smoothie and juice
  '#F2992E',
  '#E2B84A',
  '#8DB04A',
  '#B8325E',
  '#7E1F43',
  '#F2B33D',
  '#E9D49B',
  '#F3E38C',
  '#EE7F2D',
  '#EF6A6F',
  '#5A2747',
  // water
  '#CFE8F1',
  '#0B7391',
  // garnish
  '#FBE3B5',
  '#F2D64B',
  '#9CC23F',
  '#C2345F',
  '#5E9E4F',
  '#FFFFFF',
  '#F2C230',
  '#F7F7F2',
  '#8A4B2A',
  '#6B3A22',
  '#4E8F3A',
  '#C83B33',
  '#F3DC7A',
  '#7A4A2A',
];

// ---------------------------------------------------------------------------------------------
// Colour maths (sRGB, CIE Lab D65, WCAG contrast).

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};
const WHITE = [0.95047, 1, 1.08883];
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const labFi = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const fx = labF(x / WHITE[0]);
  const fy = labF(y / WHITE[1]);
  const fz = labF(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToHex([l, a, bb]) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const x = labFi(fx) * WHITE[0];
  const y = labFi(fy) * WHITE[1];
  const z = labFi(fz) * WHITE[2];
  const rgb = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
  return (
    '#' +
    rgb
      .map(fromLinear)
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** The one shade tone of a palette colour: about 12 L* darker (DESIGN.md 3.2, Icon L). */
export function shadeOf(hex) {
  const lab = hexToLab(hex);
  lab[0] -= 12;
  return labToHex(lab);
}

export function deltaE(h1, h2) {
  const a = hexToLab(h1);
  const b = hexToLab(h2);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function contrast(h1, h2) {
  const lum = (h) => {
    const [r, g, b] = hexToRgb(h).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(h1), lum(h2)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every colour drink art may use: palette, shade tones, category inks, outline colours. */
export function allowedColours() {
  const set = new Set(PALETTE);
  for (const c of PALETTE) set.add(shadeOf(c));
  for (const k of CATEGORIES) INK[k].forEach((c) => set.add(c));
  set.add(OUTLINE.dark);
  return [...set];
}

// ---------------------------------------------------------------------------------------------
// SVG helpers.

/**
 * Dark-mode outline swap for heroes: only inside elements whose id starts with "contour" does
 * steel #17202A become #EEF2F5. Shadows and speckle keep #17202A. Handles nested groups.
 */
export function swapContour(svg, from = OUTLINE.light, to = OUTLINE.dark) {
  let depth = 0;
  return svg.replace(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g, (tag, close, _name, attrs, self) => {
    if (depth > 0) {
      if (close) depth -= 1;
      else if (!self) depth += 1;
      return tag.replaceAll(from, to);
    }
    if (!close && /\bid="contour/.test(attrs)) {
      if (!self) depth = 1;
      return tag.replaceAll(from, to);
    }
    return tag;
  });
}

/**
 * A hero as the dark-mode export would draw it: contour swapped, and the gleam at 70% instead of
 * 85% white (DESIGN.md 3.2).
 */
export function darkHero(svg) {
  return swapContour(svg).replace(
    /(<[^>]*(?:fill|stroke)="#FFFFFF"[^>]*(?:fill|stroke)-opacity=")0\.85(")/g,
    '$10.7$2',
  );
}

/** Dark-mode outline swap for icons and glyphs (DESIGN.md 3.5): every #17202A. */
export function swapAll(svg, from = OUTLINE.light, to = OUTLINE.dark) {
  return svg.replaceAll(from, to).replaceAll(from.toLowerCase(), to);
}

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

/** Which category a file belongs to, from its name: coffee.svg, coffee.espresso.svg, etc. */
export function categoryOf(file) {
  const base = path.basename(file, '.svg');
  const key = base.split('.')[0];
  return CATEGORIES.includes(key) ? key : undefined;
}

/** Folder kind: heroes, icons, glyphs, brand, or the folder name. */
export function kindOf(relPath) {
  return relPath.split(/[\\/]/)[0];
}

const DRINK_KINDS = new Set(['heroes', 'icons', 'glyphs']);
const VIEWBOX = {
  heroes: ['0 0 1024 1024'],
  icons: ['0 0 24 24', '0 0 64 64'],
  glyphs: ['0 0 24 24'],
};

/**
 * Checks one SVG against DESIGN.md 3.3 and 3.5. Returns a list of { level, message }.
 * Brand files get the structural checks only (no palette or ellipse rule).
 */
export function checkSvg(svg, relPath, allowed = allowedColours()) {
  const issues = [];
  const kind = kindOf(relPath);
  const err = (message) => issues.push({ level: 'error', message });

  const root = svg.match(/<svg\b[^>]*>/);
  if (!root) {
    err('No <svg> root element.');
    return issues;
  }
  const viewBox = attr(root[0], 'viewBox');
  if (!viewBox) err('No viewBox.');
  else if (VIEWBOX[kind] && !VIEWBOX[kind].includes(viewBox.trim().replace(/\s+/g, ' '))) {
    err(`viewBox "${viewBox}" must be ${VIEWBOX[kind].join(' or ')}.`);
  }

  for (const el of ['image', 'text', 'filter', 'foreignObject', 'style', 'script', 'font']) {
    if (new RegExp(`<${el}[\\s>/]`).test(svg)) err(`Contains <${el}>.`);
  }
  if (/\sclass="/.test(svg)) err('Uses CSS classes.');
  if (/\sstyle="/.test(svg)) err('Uses style attributes; colours must be literal fill and stroke.');
  if (/data:image\//.test(svg) || /\shref="(?!#)/.test(svg)) err('Links or embeds an image.');
  if (/<(linear|radial)Gradient/.test(svg)) err('Contains a gradient.');

  if (!DRINK_KINDS.has(kind)) return issues;

  // Palette: every literal colour in fill or stroke.
  const colours = new Set();
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,6})"/g)) {
    colours.add(m[1].toUpperCase());
  }
  for (const c of colours) {
    const near = allowed.some((a) => a === c || deltaE(a, c) < 2.5);
    if (!near) err(`Colour ${c} is not in the illustration palette (DESIGN.md 3.2).`);
  }
  for (const m of svg.matchAll(/(?:fill|stroke)="(?!none|#|url\()([^"]+)"/g)) {
    err(`Colour "${m[1]}" is not a literal hex.`);
  }

  // Rims, liquid surfaces, bases and cast shadows are ellipses at minor/major 0.30 +/- 0.02
  // (DESIGN.md 3.1). An <ellipse> can also be a petal or a seed, so this is a warning to eyeball,
  // not a failure.
  const odd = new Map();
  for (const m of svg.matchAll(/<ellipse\b[^>]*>/g)) {
    const rx = Number(attr(m[0], 'rx'));
    const ry = Number(attr(m[0], 'ry'));
    if (!(rx > 0 && ry > 0) || rx === ry) continue;
    const ratio = Math.min(rx, ry) / Math.max(rx, ry);
    if (Math.abs(ratio - 0.3) > 0.02) {
      const key = ratio.toFixed(2);
      odd.set(key, (odd.get(key) ?? 0) + 1);
    }
  }
  for (const [ratio, n] of odd) {
    issues.push({
      level: 'warning',
      message: `${n} ellipse${n > 1 ? 's' : ''} at ratio ${ratio}, not 0.30. Fine for petals and seeds; not for rims, surfaces or bases.`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Collect and render.

export function collectArt(artDir) {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Folders like _source hold generator scripts and drafts, not shipped art.
        if (!entry.name.startsWith('_') && !entry.name.startsWith('.')) walk(full);
      } else if (entry.name.toLowerCase().endsWith('.svg')) files.push(full);
    }
  };
  walk(artDir);
  const allowed = allowedColours();
  return files
    .map((full) => {
      const rel = path.relative(artDir, full).split(path.sep).join('/');
      const svg = fs.readFileSync(full, 'utf8');
      return {
        rel,
        kind: kindOf(rel),
        category: categoryOf(full),
        svg,
        issues: checkSvg(svg, rel, allowed),
      };
    })
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function sortKey(item) {
  const cat = item.category ? CATEGORIES.indexOf(item.category) : 9;
  return `${item.rel.split('/').slice(0, -1).join('/')}|${cat}|${item.rel}`;
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const img = (svg, size, label) =>
  `<img src="${svgUri(svg)}" width="${size}" height="${size}" alt="${esc(label)}" />`;

function heroContrast(item) {
  const cat = item.category;
  if (!cat) return '';
  const light = contrast(OUTLINE.light, TINT[cat][0]);
  const dark = contrast(OUTLINE.dark, TINT[cat][1]);
  const fmt = (v) => `${v.toFixed(1)}:1${v >= 3 ? '' : ' (below 3:1)'}`;
  return `Contour on tint: light ${fmt(light)}, dark ${fmt(dark)}`;
}

function heroSection(items) {
  if (!items.length) return emptyNote('heroes');
  const rows = items.map((item) => {
    const cat = item.category;
    const [lt, dk] = cat ? TINT[cat] : [SURFACE.light, SURFACE.dark];
    const dark = darkHero(item.svg);
    const name = cat ? CATEGORY_NAMES[cat] : item.rel;
    return `<section class="hero">
  <h3>${esc(name)} <code>${esc(item.rel)}</code></h3>
  <div class="hero-row">
    <figure style="background:${lt}">${img(item.svg, 360, `${name} hero on light tint`)}<figcaption>Light tint</figcaption></figure>
    <figure style="background:${dk}">${img(dark, 360, `${name} hero on dark tint`)}<figcaption class="on-dark">Dark tint: contour #EEF2F5, gleam 70%</figcaption></figure>
    <div class="crop">
      <figure style="background:${lt}">${img(item.svg, 104, `${name} hero at 104`)}<figcaption>104 pt widget</figcaption></figure>
      <figure style="background:${lt}">${img(item.svg, 48, `${name} hero at 48`)}<figcaption>48 pt</figcaption></figure>
      <figure style="background:${dk}">${img(dark, 48, `${name} hero at 48, dark`)}<figcaption class="on-dark">48 pt</figcaption></figure>
    </div>
  </div>
  <p class="meta">${esc(heroContrast(item))}</p>
</section>`;
  });
  const lineup = items
    .map(
      (item) =>
        `<figure style="background:${item.category ? TINT[item.category][0] : SURFACE.light}">${img(item.svg, 180, item.rel)}</figure>`,
    )
    .join('');
  return `<p class="lede">Side by side: same light, same strokes, same ground line.</p>
<div class="lineup">${lineup}</div>
${rows.join('\n')}`;
}

function iconSection(items) {
  if (!items.length) return emptyNote('icons');
  const groups = new Map();
  for (const item of items) {
    const folder = item.rel.split('/').slice(0, -1).join('/');
    const key = `${folder}|${item.category ?? 'other'}`;
    if (!groups.has(key)) groups.set(key, { folder, category: item.category, drinks: new Map() });
    // coffee.cortado.24.svg and coffee.cortado.64.svg are two optical sizes of one drink.
    const m = path.basename(item.rel, '.svg').match(/^(.*?)(?:[._-](24|64|S|L))?$/);
    const id = m[1];
    const drinks = groups.get(key).drinks;
    if (!drinks.has(id)) drinks.set(id, {});
    const size = m[2] === '24' || m[2] === 'S' ? 24 : m[2] === '64' || m[2] === 'L' ? 64 : 0;
    drinks.get(id)[size] = item;
  }
  return [...groups.values()]
    .map((g) => {
      const title = `${g.category ? CATEGORY_NAMES[g.category] : 'Other'} <code>${esc(g.folder)}</code>`;
      const cells = (mode) =>
        [...g.drinks]
          .map(([id, sizes]) => {
            const tile = (size) => {
              const item = sizes[size] ?? sizes[0];
              if (!item) return `<span style="width:${size}px"></span>`;
              const svg = mode === 'dark' ? swapAll(item.svg) : item.svg;
              return img(svg, size, `${id} at ${size}`);
            };
            const all = Object.values(sizes);
            const bad = all.some((i) => i.issues.some((x) => x.level === 'error')) ? ' bad' : '';
            return `<figure class="icon${bad}">${tile(24)}${tile(64)}<figcaption>${esc(id)}</figcaption></figure>`;
          })
          .join('');
      return `<h3>${title}</h3>
<div class="icon-grid" style="background:${SURFACE.light}">${cells('light')}</div>
<div class="icon-grid on-dark" style="background:${SURFACE.dark}">${cells('dark')}</div>`;
    })
    .join('\n');
}

function glyphSection(items) {
  if (!items.length) return emptyNote('glyphs');
  const cells = (mode) =>
    items
      .map((item) => {
        const svg = mode === 'dark' ? swapAll(item.svg) : item.svg;
        const name = item.category ? CATEGORY_NAMES[item.category] : item.rel;
        return `<figure class="icon">${img(svg, 18, `${name} glyph at 18`)}${img(svg, 24, `${name} glyph at 24`)}${img(svg, 48, `${name} glyph at 48`)}<figcaption>${esc(name)}</figcaption></figure>`;
      })
      .join('');
  const tinted = items
    .filter((item) => item.category)
    .map((item) => {
      const ink = INK[item.category][0];
      const svg = swapAll(item.svg, OUTLINE.light, ink);
      return `<span class="chip" style="background:${TINT[item.category][0]};color:${ink}">${img(svg, 20, `${item.category} chip glyph`)}${esc(CATEGORY_NAMES[item.category])}</span>`;
    })
    .join('');
  return `<p class="lede">18, 24 and 48 px. Then in category chips, glyph in category ink.</p>
<div class="icon-grid" style="background:${SURFACE.light}">${cells('light')}</div>
<div class="icon-grid on-dark" style="background:${SURFACE.dark}">${cells('dark')}</div>
<div class="chips">${tinted}</div>`;
}

function brandSection(items) {
  if (!items.length) return emptyNote('brand');
  const cell = (item) => {
    const name = path.basename(item.rel, '.svg');
    const isDark = /dark/.test(name);
    const isWhite = /mono|android|notification/.test(name) && /#FFFFFF/i.test(item.svg);
    const isIcon = /app-icon|android/.test(name);
    const wide = /wordmark|lockup/.test(name);
    const bgs = isWhite
      ? [SURFACE.dark, '#2443A6']
      : isDark
        ? [SURFACE.dark]
        : isIcon
          ? ['#E9EDF0']
          : [SURFACE.light, '#E9EDF0'];
    const sizes = wide ? [420, 120, 56] : isIcon ? [180, 60] : [160, 64, 32, 16];
    const tiles = bgs
      .map(
        (bg) =>
          `<div class="brand-tile${bg === SURFACE.dark || bg === '#2443A6' ? ' on-dark' : ''}" style="background:${bg}">${sizes
            .map(
              (s) =>
                `<img src="${svgUri(item.svg)}" ${wide ? `width="${s}"` : `width="${s}" height="${s}"`} alt="${esc(`${name} at ${s}`)}" />`,
            )
            .join('')}</div>`,
      )
      .join('');
    return `<section class="brand"><h3><code>${esc(item.rel)}</code></h3>${tiles}</section>`;
  };
  const order = [
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
    'android-notification',
  ];
  const rank = (item) => {
    const i = order.indexOf(path.basename(item.rel, '.svg'));
    return i === -1 ? order.length : i;
  };
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.rel.localeCompare(b.rel));
  const icon = items.find((i) => path.basename(i.rel) === 'app-icon.svg');
  const dark = items.find((i) => path.basename(i.rel) === 'app-icon-dark.svg');
  const preview = [icon, dark]
    .filter(Boolean)
    .map(
      (item) =>
        `<img class="masked" src="${svgUri(item.svg)}" width="120" height="120" alt="${esc(path.basename(item.rel, '.svg'))} with a home-screen mask" />`,
    )
    .join('');
  const masked = preview
    ? `<section class="brand"><h3>On a home screen (rounded mask, approximate)</h3><div class="brand-tile" style="background:#E9EDF0">${preview}</div></section>`
    : '';
  return sorted.map(cell).join('\n') + masked;
}

function emptyNote(kind) {
  return `<p class="lede">No SVG files in <code>app/assets/art/${kind}</code> yet.</p>`;
}

function checksSection(items) {
  const failing = items.filter((item) => item.issues.length);
  const errors = failing.filter((item) => item.issues.some((i) => i.level === 'error')).length;
  const rules =
    'Rules: viewBox, no rasters, text, filters, classes or gradients; drink art uses only palette colours (DESIGN.md 3.2, shade tones included); ellipses at 0.30.';
  const summary = `${items.length} files checked: ${errors} failing, ${failing.length - errors} with warnings only. ${rules}`;
  if (!failing.length) return `<p class="lede">${summary}</p>`;
  const rows = failing
    .map(
      (item) =>
        `<tr><td><code>${esc(item.rel)}</code></td><td><ul>${item.issues.map((i) => `<li class="${i.level}">${esc(i.level === 'error' ? i.message : `Warning: ${i.message}`)}</li>`).join('')}</ul></td></tr>`,
    )
    .join('');
  return `<p class="lede">${summary}</p><table class="checks"><tbody>${rows}</tbody></table>`;
}

export function buildGallery(items) {
  const by = (kind) => items.filter((i) => i.kind === kind);
  const known = new Set(['heroes', 'icons', 'glyphs', 'brand']);
  const other = items.filter((i) => !known.has(i.kind));
  const count = (kind) => by(kind).length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Clink art gallery</title>
<style>
:root { --base:#F6F8F9; --raised:#FFFFFF; --sunk:#E9EDF0; --ink:#17202A; --ink2:#4A5563; --line:#D5DCE2; --cobalt:#2443A6; --danger:#A8301F; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--base); color: var(--ink); font: 15px/1.45 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
header { padding: 28px 24px 20px; border-top: 6px solid var(--cobalt); border-bottom: 1px solid var(--line); }
header h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -0.01em; }
header p { margin: 0; color: var(--ink2); max-width: 60ch; }
nav { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 14px; }
nav a { color: var(--cobalt); text-decoration: none; font-weight: 600; }
main { padding: 0 24px 48px; }
h2 { font-size: 20px; margin: 36px 0 6px; padding-top: 12px; border-top: 1px solid var(--line); }
h3 { font-size: 15px; margin: 22px 0 8px; }
h3 code, td code { font-weight: 400; color: var(--ink2); font-size: 13px; }
.lede, .meta { color: var(--ink2); margin: 0 0 12px; max-width: 70ch; }
.meta { font-size: 13px; margin-top: 6px; }
figure { margin: 0; }
figcaption { font-size: 12px; color: var(--ink2); padding: 4px 8px 6px; }
.on-dark figcaption, figcaption.on-dark { color: #A9B4BF; }
.lineup { display: flex; flex-wrap: wrap; gap: 8px; }
.lineup figure { display: flex; }
.hero-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.hero-row > figure img { display: block; max-width: 100%; height: auto; }
.crop { display: flex; flex-direction: column; gap: 8px; }
.crop figure { display: flex; align-items: center; gap: 4px; padding: 6px; }
.icon-grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 10px; }
.icon { display: grid; grid-template-columns: auto auto auto; align-items: end; gap: 8px; width: 156px; padding: 8px; }
.icon figcaption { grid-column: 1 / -1; padding: 0; overflow-wrap: anywhere; }
.icon.bad { outline: 2px solid var(--danger); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px; border-radius: 999px; font-weight: 600; font-size: 15px; }
.brand { margin-bottom: 8px; }
.brand-tile { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 16px; margin: 0 8px 8px 0; vertical-align: top; max-width: 100%; }
.brand-tile img { max-width: 100%; height: auto; }
.masked { border-radius: 22.4%; }
table.checks { border-collapse: collapse; width: 100%; max-width: 980px; }
.checks td { border-top: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
.checks ul { margin: 0; padding-left: 18px; }
.checks li.error { color: var(--danger); }
.checks li.warning { color: var(--ink2); }
@media (max-width: 600px) { header, main { padding-left: 16px; padding-right: 16px; } }
</style>
</head>
<body>
<header>
<h1>Clink art gallery</h1>
<p>Every SVG in <code>app/assets/art</code>, on light and dark. Generated by <code>scripts/gen-art-gallery.mjs</code>; rerun it after any art change. Rules: DESIGN.md 1.3 and 3.</p>
<nav><a href="#checks">Checks</a><a href="#heroes">Heroes (${count('heroes')})</a><a href="#icons">Drink icons (${count('icons')})</a><a href="#glyphs">Glyphs (${count('glyphs')})</a><a href="#brand">Brand (${count('brand')})</a></nav>
</header>
<main>
<h2 id="checks">Checks</h2>
${checksSection(items)}
<h2 id="heroes">Heroes</h2>
${heroSection(by('heroes'))}
<h2 id="icons">Drink icons</h2>
<p class="lede">Each drink: the 24 grid master at 24 px and the 64 grid master at 64 px. Dark rows swap the outline #17202A for #EEF2F5, as the export does.</p>
${iconSection(by('icons'))}
<h2 id="glyphs">Category glyphs</h2>
${glyphSection(by('glyphs'))}
<h2 id="brand">Brand</h2>
${brandSection(by('brand'))}
${other.length ? `<h2 id="other">Other</h2>\n${iconSection(other)}` : ''}
</main>
</body>
</html>
`;
}

async function formatHtml(html) {
  try {
    const prettier = await import('prettier');
    const config = (await prettier.resolveConfig(path.join(ROOT, 'docs/art/gallery.html'))) ?? {};
    return await prettier.format(html, { ...config, parser: 'html' });
  } catch {
    return html; // Prettier is a dev dependency; without it the page is still valid HTML.
  }
}

async function screenshot(htmlFile, pngFile) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    // A global install is found through NODE_PATH, which only require() honours.
    try {
      ({ chromium } = createRequire(import.meta.url)('playwright'));
    } catch {
      chromium = undefined;
    }
  }
  if (!chromium) {
    throw new Error(
      '--png needs Playwright (npm i -D playwright, then npx playwright install chromium).',
    );
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(pathToFileURL(htmlFile).href);
    await page.waitForLoadState('load');
    await page.screenshot({ path: pngFile, fullPage: true });
  } finally {
    await browser.close();
  }
}

export function parseArgs(argv) {
  const opts = {
    art: path.join(ROOT, 'app/assets/art'),
    out: path.join(ROOT, 'docs/art/gallery.html'),
    png: undefined,
    check: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--art') opts.art = path.resolve(argv[++i]);
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--png') opts.png = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const items = collectArt(opts.art);
  const html = await formatHtml(buildGallery(items));
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, html);
  const failing = items.filter((i) => i.issues.length);
  const errors = items.filter((i) => i.issues.some((x) => x.level === 'error'));
  console.log(
    `gallery: ${items.length} SVGs -> ${path.relative(process.cwd(), opts.out)}; ${errors.length} failing, ${failing.length - errors.length} with warnings only`,
  );
  for (const item of failing) {
    for (const issue of item.issues) console.log(`  ${issue.level} ${item.rel}: ${issue.message}`);
  }
  if (opts.png) {
    await screenshot(opts.out, opts.png);
    console.log(`png: ${path.relative(process.cwd(), opts.png)}`);
  }
  return opts.check && errors.length ? 1 : 0;
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
