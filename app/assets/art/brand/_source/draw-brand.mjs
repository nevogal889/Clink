// Brand mark generator: the rim seen from above (DESIGN.md 1.3, DECISIONS.md "CEO answers after
// the first art review"). Writes every brand file that carries the mark. The three wordmark files
// are hand-drawn and only read here (the lockup copies their letters).
//
// Run: node app/assets/art/brand/_source/draw-brand.mjs
//
// Geometry, in mark units (mark is 100 wide, centred on 0,0):
//   rim     an elliptical band. Outer edge 100 x 52.8 (ratio 0.53). Opening 75 x 27.75, raised
//           1.6 so the near lip (12.5 at the sides, 14.1 at the front, 10.9 at the back) is the
//           heaviest edge: that, plus the ellipse, is the perspective that makes it a rim.
//   wall    the inside back wall seen through the opening: the opening minus a lower, narrower
//           ellipse (the drink surface, left empty so the background shows through).
//   gleam   one tapered sliver on the wall, left of centre (light from the top left).
// The rim band is the wordmark tittle's idea at icon scale: tittle centre line ratio 0.42, here
// 0.46 so the band reads as thick at 29 pt.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..');

export const COBALT = '#2443A6';
export const COBALT_DARK = '#9DB2F2';
export const STEEL = '#17202A';
export const WHITE = '#FFFFFF';
export const ENAMEL = '#EEF2F5';

const K = 0.46; // centre-line ellipse ratio of the rim band
const BAND = 12.5; // band width at the sides
const LIFT = 1.6; // opening raised by this much: heavier near lip
const DRINK = { rx: 0.74, ratio: 0.355, drop: 8.5 }; // drink surface inside the opening

const n = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Rim geometry in mark units. */
export function rimGeometry() {
  const crx = 50 - BAND / 2;
  const cry = crx * K;
  const outer = { cx: 0, cy: 0, rx: 50, ry: cry + BAND / 2 };
  const open = { cx: 0, cy: -LIFT, rx: crx - BAND / 2, ry: cry - BAND / 2 };
  const drinkRx = open.rx * DRINK.rx;
  const drink = { cx: 0, cy: open.cy + DRINK.drop, rx: drinkRx, ry: drinkRx * DRINK.ratio };
  return { outer, open, drink };
}

const inside = (e, x, y) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;

/** Where the drink ellipse crosses the opening, on the right side (x > 0). */
function crossing(open, drink) {
  // Walk the drink outline from its top (t = 0) clockwise; the top is inside the opening.
  const at = (t) => [drink.cx + drink.rx * Math.sin(t), drink.cy - drink.ry * Math.cos(t)];
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const [x, y] = at(mid);
    if (inside(open, x, y)) lo = mid;
    else hi = mid;
  }
  return at(lo);
}

/** An ellipse as a path, so it can be combined with others under one fill rule. */
function ellipsePath(e, t) {
  const l = t(e.cx - e.rx, e.cy);
  const r = t(e.cx + e.rx, e.cy);
  const rx = e.rx * t.s;
  const ry = e.ry * t.s;
  return `M${n(l[0])} ${n(l[1])}A${n(rx)} ${n(ry)} 0 1 0 ${n(r[0])} ${n(r[1])}A${n(rx)} ${n(ry)} 0 1 0 ${n(l[0])} ${n(l[1])}Z`;
}

/**
 * The mark's paths, scaled by s and centred on (cx, cy).
 * gap > 0 insets the wall from the rim, for one-colour silhouettes where the two would merge.
 */
export function markPaths({ s, cx, cy, gap = 0 }) {
  const t = (x, y) => [cx + x * s, cy + y * s];
  t.s = s;
  const { outer, open, drink } = rimGeometry();
  const rim = ellipsePath(outer, t) + ellipsePath(open, t);

  const wallTop = { ...open, rx: open.rx - gap, ry: open.ry - gap };
  const [px, py] = crossing(wallTop, drink);
  const a = t(-px, py);
  const b = t(px, py);
  // Up and over the back of the opening, then back along the top of the drink surface.
  const wall =
    `M${n(a[0])} ${n(a[1])}` +
    `A${n(wallTop.rx * s)} ${n(wallTop.ry * s)} 0 1 1 ${n(b[0])} ${n(b[1])}` +
    `A${n(drink.rx * s)} ${n(drink.ry * s)} 0 ${py > drink.cy ? 1 : 0} 0 ${n(a[0])} ${n(a[1])}Z`;

  // Gleam: a sliver centred between the wall's top edge and the drink, tapering at both ends.
  const yTop = (x) => wallTop.cy - wallTop.ry * Math.sqrt(Math.max(0, 1 - (x / wallTop.rx) ** 2));
  const yLow = (x) => drink.cy - drink.ry * Math.sqrt(Math.max(0, 1 - (x / drink.rx) ** 2));
  const steps = 10;
  const from = -0.8 * open.rx;
  const to = -0.38 * open.rx;
  const upper = [];
  const lower = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = from + ((to - from) * i) / steps;
    const top = yTop(x);
    const low = Math.min(yLow(x), open.cy + open.ry);
    const mid = top + (low - top) * 0.42;
    const half = (low - top) * 0.2 * Math.sin((Math.PI * i) / steps) ** 0.6;
    upper.push(t(x, mid - half));
    lower.push(t(x, mid + half));
  }
  const pts = [...upper, ...lower.reverse()];
  const gleam = `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
  return { rim, wall, gleam };
}

const svg = (viewBox, comment, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n  <!-- ${comment} -->\n${body
    .map((line) => `  ${line}`)
    .join('\n')}\n</svg>\n`;

/** Full-colour mark: rim, wall, gleam. Colours per surface. */
function markBody(p, { rim, wall, gleam, gleamOpacity }) {
  const out = [`<path fill-rule="evenodd" d="${p.rim}" fill="${rim}"/>`];
  if (wall) out.push(`<path d="${p.wall}" fill="${wall}"/>`);
  if (gleam) {
    const op = gleamOpacity ? ` fill-opacity="${gleamOpacity}"` : '';
    out.push(`<path d="${p.gleam}" fill="${gleam}"${op}/>`);
  }
  return out;
}

/** One-colour silhouette: rim plus a wall inset by a gap, so it survives a flat tint. */
function silhouette(p, colour) {
  return [`<path fill-rule="evenodd" d="${p.rim}${p.wall}" fill="${colour}"/>`];
}

export function buildBrand() {
  const files = {};
  const SQUARE = '0 0 100 100';

  // Marks on a 100 square, mark 92 wide (clear space is added by the layout, DESIGN.md 1.3).
  const m = { s: 0.92, cx: 50, cy: 50 };
  files['mark.svg'] = svg(
    SQUARE,
    'Clink mark, 64 px and up (DESIGN.md 1.3): a cup rim seen from above. Cobalt rim, the inside back wall in dark-mode cobalt, one white gleam.',
    markBody(markPaths(m), { rim: COBALT, wall: COBALT_DARK, gleam: WHITE }),
  );
  files['mark-small.svg'] = svg(
    SQUARE,
    'Clink mark under 64 px (DESIGN.md 1.3): rim and back wall, no gleam.',
    markBody(markPaths(m), { rim: COBALT, wall: COBALT_DARK }),
  );
  files['mark-mono.svg'] = svg(
    SQUARE,
    'Clink mark, one colour (DESIGN.md 1.3): rim and back wall with a gap between them. Swap the fill for the surface ink.',
    silhouette(markPaths({ ...m, gap: 2.4 }), STEEL),
  );

  // App icons: 1024 full bleed, the OS applies its mask. Rim 700 wide, centre 2% low so the
  // heavier near lip doesn't make the mark look like it is sliding down.
  const icon = { s: 7, cx: 512, cy: 532 };
  const ip = markPaths(icon);
  files['app-icon.svg'] = svg(
    '0 0 1024 1024',
    'App icon, iOS light and store listing (DESIGN.md 1.3): cobalt field, enamel white rim, back wall #9DB2F2, white gleam. The drink is the cobalt field showing through.',
    [
      `<rect width="1024" height="1024" fill="${COBALT}"/>`,
      ...markBody(ip, { rim: WHITE, wall: COBALT_DARK, gleam: WHITE }),
    ],
  );
  files['app-icon-dark.svg'] = svg(
    '0 0 1024 1024',
    'App icon, iOS dark (DESIGN.md 1.3): #9DB2F2 rim on steel, back wall cobalt, gleam enamel white at 70%.',
    [
      `<rect width="1024" height="1024" fill="${STEEL}"/>`,
      ...markBody(ip, { rim: COBALT_DARK, wall: COBALT, gleam: ENAMEL, gleamOpacity: '0.7' }),
    ],
  );
  files['app-icon-mono.svg'] = svg(
    '0 0 1024 1024',
    'App icon, iOS tinted source (DESIGN.md 1.3): greyscale on transparent. White rim and gleam, grey back wall; the OS applies the tint.',
    markBody(ip, { rim: WHITE, wall: '#8C8C8C', gleam: WHITE }),
  );

  // Android adaptive icon: 108 dp canvas, 66 dp safe zone. The rim is 60 dp wide; its ends sit
  // 30 dp from the centre, inside the 33 dp safe radius.
  const fg = { s: 0.6, cx: 54, cy: 55 };
  files['android-adaptive-foreground.svg'] = svg(
    '0 0 108 108',
    'Android adaptive icon foreground (DESIGN.md 1.3): 108 dp canvas, rim 60 dp wide inside the 66 dp safe zone. Background layer is plain cobalt #2443A6.',
    markBody(markPaths(fg), { rim: WHITE, wall: COBALT_DARK, gleam: WHITE }),
  );
  files['android-monochrome.svg'] = svg(
    '0 0 108 108',
    'Android adaptive icon monochrome layer, for themed icons (DESIGN.md 1.3): one-colour silhouette, Android reads its alpha only. Rim and back wall with a gap.',
    silhouette(markPaths({ ...fg, gap: 2.4 }), WHITE),
  );
  // Notification small icon: 24 dp, 2 dp padding, so the rim is 20 dp wide. The wall gap is
  // 1 dp, the smallest that survives mdpi.
  files['android-notification.svg'] = svg(
    '0 0 24 24',
    'Android notification small icon (DESIGN.md 1.3): white silhouette on transparent, 24 dp. Rim and back wall with a 1 dp gap; no gleam.',
    silhouette(markPaths({ s: 0.2, cx: 12, cy: 12.3, gap: 5 }), WHITE),
  );

  // Lockup: mark left, wordmark right. Mark width = x-height x 1.5 (150), centred on the
  // x-height band (y 0 to 100), gap = one stem (24).
  const word = readFileSync(join(OUT, 'wordmark.svg'), 'utf8');
  const letters = word.match(/<g fill="#17202A">[\s\S]*?<\/g>/)[0];
  const tittle = word.match(/<ellipse[^>]*\/>/)[0];
  const lp = markPaths({ s: 1.5, cx: 75, cy: 50 });
  files['lockup.svg'] = svg(
    '0 -42 522 146',
    'Lockup (DESIGN.md 1.3): rim mark left, wordmark right. Mark width = x-height x 1.5, centred on the x-height band, gap = one stem.',
    [
      ...markBody(lp, { rim: COBALT, wall: COBALT_DARK, gleam: WHITE }),
      '<g transform="translate(174 0)">',
      ...letters.split('\n').map((l) => l.replace(/^\s{2}/, '')),
      tittle,
      '</g>',
    ],
  );
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  const files = buildBrand();
  for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT, name), content);
  console.log(`brand: wrote ${Object.keys(files).length} files`);
}
