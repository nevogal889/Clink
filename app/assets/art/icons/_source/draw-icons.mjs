// Drink icon generator. Draws the 42 drink icons of DESIGN.md 3.4 on the 24 grid (Icon S)
// and the 64 grid (Icon L) and writes them next to this folder as {drinkId}.{24|64}.svg.
//
// Run: node app/assets/art/icons/_source/draw-icons.mjs
//
// Every drawing is authored here in 24-grid units. Icon L reuses the same geometry scaled by
// 64/24 and adds the shade tone, the gleam and the inner back wall (DESIGN.md 3.2).
// Colours are literal palette hex only. Outlines are #17202A; the dark variant swaps colours
// with theme.json (see the build note docs/build-notes/art-b.md).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..');

// ---------------------------------------------------------------------------------------------
// Palette (DESIGN.md 3.2). Only these values may appear in the files.
export const C = {
  outline: '#17202A',
  // category inks (light mode). Chawan uses the dark-mode matcha ink in both themes.
  inkCoffee: '#4B3527',
  inkMatcha: '#36591A',
  inkMatchaDark: '#B7D69A',
  inkTea: '#6B5306',
  inkSmoothie: '#9E2460',
  inkWater: '#085C74',
  // bodies
  enamel: '#F4F6F7',
  ceramic: '#EEF0EE',
  glass: '#DCEEF3',
  glaze: '#2E3A2C',
  drip: '#4C5E45',
  clay: '#CDBFA6',
  steel: '#8E9AA6',
  bamboo: '#C9A86A',
  tag: '#F5EDCF',
  cap: '#17202A',
  white: '#FFFFFF',
  // coffee
  espresso: '#3B2418',
  crema: '#B77A45',
  black: '#4A2C1E',
  milkCoffee: '#B88A64',
  foam: '#F2EFEA',
  chocolate: '#5A3322',
  // matcha
  matcha: '#7BA23F',
  froth: '#8CB24A',
  frothBubble: '#A9C96A',
  matchaMilk: '#B5CB86',
  hojicha: '#9A6B45',
  milk: '#F2EFEA',
  strawPuree: '#E0475A',
  // tea
  blackTea: '#B8641E',
  milkyTea: '#C49470',
  greenTea: '#C9C26A',
  jasmine: '#D9C77A',
  oolong: '#C08A2E',
  chai: '#B88660',
  chamomile: '#E3C14F',
  peppermint: '#A8C77A',
  gingerLemon: '#E7CF7A',
  leaf: '#6E7F3A',
  // smoothie & juice
  orange: '#F2992E',
  greenSmoothie: '#8DB04A',
  berry: '#B8325E',
  berrySeed: '#7E1F43',
  mango: '#F2B33D',
  banana: '#E9D49B',
  lemonade: '#F3E38C',
  carrot: '#EE7F2D',
  watermelon: '#EF6A6F',
  acai: '#5A2747',
  // water
  water: '#CFE8F1',
  bubble: '#0B7391',
  // garnish
  rind: '#F2992E',
  pith: '#FBE3B5',
  lemon: '#F2D64B',
  lime: '#9CC23F',
  raspberry: '#C2345F',
  strawberry: '#E0475A',
  mint: '#5E9E4F',
  petal: '#FFFFFF',
  petalCentre: '#F2C230',
  jasminePetal: '#F7F7F2',
  cinnamon: '#8A4B2A',
  anise: '#6B3A22',
  melonRind: '#4E8F3A',
  appleSkin: '#C83B33',
  bananaSlice: '#F3DC7A',
  bean: '#4A2A1C',
};

// ---------------------------------------------------------------------------------------------
// Colour maths for the L shade tone: body colour darkened about 12 L* (DESIGN.md 3.2).
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const delin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const WP = [0.95047, 1, 1.08883];
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const finv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
function toLab(hex) {
  const [r, g, b] = hexToRgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / WP[0];
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / WP[1];
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / WP[2];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function fromLab([L, a, b]) {
  const fy = (L + 16) / 116;
  const x = finv(fy + a / 500) * WP[0];
  const y = finv(fy) * WP[1];
  const z = finv(fy - b / 200) * WP[2];
  const r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const bl = 0.0557 * x - 0.204 * y + 1.057 * z;
  return rgbToHex([r, g, bl].map((v) => delin(Math.max(0, Math.min(1, v)))));
}
export function shade(hex) {
  const [L, a, b] = toLab(hex);
  return fromLab([Math.max(0, L - 12), a, b]);
}

// ---------------------------------------------------------------------------------------------
// Output helpers
const R = 0.3; // every rim, surface and base ellipse: minor/major = 0.30
const DEG = Math.PI / 180;
const fmt = (v) => {
  const s = (Math.round(v * 100) / 100).toFixed(2);
  return s.replace(/\.?0+$/, '') || '0';
};

class Icon {
  constructor(size) {
    this.size = size;
    this.L = size === 'L';
    this.k = this.L ? 64 / 24 : 1;
    this.bw = this.L ? 3 : 1.5; // body stroke (output units)
    this.rw = this.L ? 4 : 2; // rim stroke
    this.dw = this.L ? 2 : 1; // detail stroke: ice, garnish, marks (2/3 of body)
    this.parts = [];
  }
  n(v) {
    return fmt(v * this.k);
  }
  p(x, y) {
    return `${this.n(x)} ${this.n(y)}`;
  }
  // path builder in 24-grid units
  d(cmds) {
    return cmds
      .map((c) => {
        const [op, ...a] = c;
        switch (op) {
          case 'M':
          case 'L':
            return `${op}${this.p(a[0], a[1])}`;
          case 'C':
            return `C${this.p(a[0], a[1])} ${this.p(a[2], a[3])} ${this.p(a[4], a[5])}`;
          case 'Q':
            return `Q${this.p(a[0], a[1])} ${this.p(a[2], a[3])}`;
          case 'A': // rx ry rot large sweep x y
            return `A${this.n(a[0])} ${this.n(a[1])} ${fmt(a[2])} ${a[3]} ${a[4]} ${this.p(a[5], a[6])}`;
          case 'Z':
            return 'Z';
          default:
            throw new Error(`bad op ${op}`);
        }
      })
      .join('');
  }
  add(s) {
    this.parts.push(s);
  }
  comment(s) {
    this.parts.push(`<!-- ${s} -->`);
  }
  path(cmds, attrs) {
    this.add(`<path d="${this.d(cmds)}"${attrStr(attrs)}/>`);
  }
  ellipse(cx, cy, rx, ry, attrs) {
    this.add(
      `<ellipse cx="${this.n(cx)}" cy="${this.n(cy)}" rx="${this.n(rx)}" ry="${this.n(ry)}"${attrStr(attrs)}/>`,
    );
  }
  circle(cx, cy, r, attrs) {
    this.add(`<circle cx="${this.n(cx)}" cy="${this.n(cy)}" r="${this.n(r)}"${attrStr(attrs)}/>`);
  }
  // rounded rect centred on (cx, cy), rotated by deg
  rrect(cx, cy, w, h, r, deg, attrs) {
    this.add(
      `<rect x="${this.n(cx - w / 2)}" y="${this.n(cy - h / 2)}" width="${this.n(w)}" height="${this.n(h)}" rx="${this.n(r)}"` +
        `${deg ? ` transform="rotate(${fmt(deg)} ${this.n(cx)} ${this.n(cy)})"` : ''}${attrStr(attrs)}/>`,
    );
  }
  // stroke attrs
  line(color, w, extra = {}) {
    return {
      fill: 'none',
      stroke: color,
      'stroke-width': fmt(w),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...extra,
    };
  }
  solid(color, strokeW, extra = {}) {
    // filled shape with outline stroke
    return {
      fill: color,
      stroke: C.outline,
      'stroke-width': fmt(strokeW ?? this.dw),
      'stroke-linejoin': 'round',
      ...extra,
    };
  }
  svg(title) {
    const s = this.L ? 64 : 24;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">\n` +
      `<!-- ${title} -->\n` +
      this.parts.map((p) => `  ${p}`).join('\n') +
      '\n</svg>\n'
    );
  }
}
function attrStr(a = {}) {
  return Object.entries(a)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
}

// ---------------------------------------------------------------------------------------------
// Vessels (DESIGN.md 3.1). All numbers in 24-grid units; bases sit on y = 21.
//
// A vessel is a surface of revolution: rim ellipse (cx, yr, rx), wall bottom ellipse
// (cx, ywb, bx), optional foot ring below it, optional saucer under everything.

class Vessel {
  constructor(o) {
    Object.assign(
      this,
      {
        wall: 'straight', // or 'arc' (cups, bowls, chawan: one convex arc)
        foot: 0,
        handle: null, // { w } handle reach in units
        saucer: null, // { rx, t }
        body: C.ceramic,
        glass: false,
        ink: C.inkCoffee,
        scale: 1,
      },
      o,
    );
    const s = this.scale;
    // scale around (cx, 21)
    this.rx *= s;
    this.bx *= s;
    this.foot *= s;
    const H = this.H * s;
    const groundY = 21;
    if (this.saucer) {
      this.saucer = { rx: this.saucer.rx * s, t: this.saucer.t * s };
      this.sy = groundY - this.saucer.t - 0.92 * R * this.saucer.rx; // saucer top ellipse centre
      this.ybase = this.sy; // cup foot sits in the saucer well
    } else {
      this.ybase = groundY - R * this.bx; // base ellipse centre so its front touches y = 21
    }
    this.ywb = this.ybase - this.foot;
    this.yr = groundY - H + R * this.rx; // rim top edge sits at 21 - H
    const { cx, rx, bx, yr, ywb } = this;
    const p0 = [cx + rx, yr];
    const p3 = [cx + bx, ywb];
    let c1;
    let c2;
    if (this.wall === 'arc') {
      c1 = [cx + rx, yr + 0.55 * (ywb - yr)];
      c2 = [cx + bx + 0.5 * (rx - bx), ywb];
    } else {
      c1 = [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3];
      c2 = [p0[0] + (2 * (p3[0] - p0[0])) / 3, p0[1] + (2 * (p3[1] - p0[1])) / 3];
    }
    this.wr = [p0, c1, c2, p3]; // right wall, rim to base
  }
  mirror([x, y]) {
    return [2 * this.cx - x, y];
  }
  get wl() {
    return this.wr.map((q) => this.mirror(q));
  }
  bez(t) {
    const [a, b, c, d] = this.wr;
    const u = 1 - t;
    return [0, 1].map(
      (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i],
    );
  }
  // right-wall half width at height y
  halfAt(y) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (this.bez(m)[1] < y) lo = m;
      else hi = m;
    }
    return this.bez((lo + hi) / 2)[0] - this.cx;
  }
  // meridian transform: silhouette point -> the front-surface line at fraction s of the half width
  T([x, y], s) {
    const dx = x - this.cx;
    return [this.cx + s * dx, y + R * dx * Math.sqrt(1 - s * s)];
  }
  bodyCmds(closeTop = true) {
    const { cx, rx, bx, ywb, yr } = this;
    const [p0L, c1L, c2L, p3L] = this.wl;
    const [p0R, c1R, c2R, p3R] = this.wr;
    const cmds = [
      ['M', ...p0L],
      ['C', ...c1L, ...c2L, ...p3L],
      ['A', bx, R * bx, 0, 0, 0, ...p3R],
      ['C', ...c2R, ...c1R, ...p0R],
    ];
    if (closeTop) cmds.push(['A', rx, R * rx, 0, 0, 0, cx - rx, yr], ['Z']);
    return cmds;
  }
  shadeCmds() {
    const s = 0.44; // right 28% of the body width
    const { rx, bx } = this;
    const [p0R, c1R, c2R, p3R] = this.wr;
    return [
      ['M', ...this.T(p0R, s)],
      ['C', ...this.T(c1R, s), ...this.T(c2R, s), ...this.T(p3R, s)],
      ['A', bx, R * bx, 0, 0, 0, ...p3R],
      ['C', ...c2R, ...c1R, ...p0R],
      ['A', rx, R * rx, 0, 0, 1, ...this.T(p0R, s)],
      ['Z'],
    ];
  }
  // gleam: centre line 18% in from the left wall, 30% to 70% of the height
  gleamCmds(from = 0.3, to = 0.7) {
    const s = -(1 - 2 * (0.18 + 0.035));
    const h = this.ywb - this.yr;
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const y = this.yr + h * (from + ((to - from) * i) / 4);
      pts.push(this.T([this.cx + this.halfAt(y), y], s));
    }
    return [['M', ...pts[0]], ...pts.slice(1).map((q) => ['L', ...q])];
  }
  gleamWidth() {
    return 0.07 * 2 * this.rx;
  }
  // handle attach points on the right wall (20% and 70% of wall height)
  handleCmds() {
    const h = this.ywb - this.yr;
    const y1 = this.yr + 0.2 * h;
    const y2 = this.yr + 0.7 * h;
    const x1 = this.cx + this.halfAt(y1) - 0.3;
    const x2 = this.cx + this.halfAt(y2) - 0.3;
    const w = this.handle.w;
    const xa = x1 + w * 0.45; // end of the flat top bar
    const xo = x1 + w; // outer reach
    return [
      ['M', x1, y1],
      ['L', xa, y1],
      ['C', xo, y1, xo, y2 - (y2 - y1) * 0.05, x2 + (xa - x1) * 0.35, y2],
      ['L', x2, y2],
    ];
  }
}

// Vessel set. Heights from DESIGN.md 3.1; widths chosen to fill the 20-unit live area.
const V = {
  V1: (o = {}) =>
    new Vessel({ cx: 10.8, rx: 3.8, bx: 2.4, H: 8, wall: 'arc', foot: 0.5, handle: { w: 2.5 }, saucer: { rx: 6.0, t: 0.8 }, ...o }),
  V2: (o = {}) =>
    new Vessel({ cx: 10.4, rx: 5.0, bx: 2.9, H: 9, wall: 'arc', foot: 0.5, handle: { w: 2.9 }, saucer: { rx: 7.5, t: 0.9 }, ...o }),
  V3: (o = {}) => new Vessel({ cx: 10.2, rx: 4.6, bx: 4.6, H: 11, body: C.enamel, handle: { w: 3.4 }, ...o }),
  V4: (o = {}) => new Vessel({ cx: 11.2, rx: 4.6, bx: 3.8, H: 10, glass: true, ...o }),
  V5: (o = {}) => new Vessel({ cx: 10.6, rx: 4.0, bx: 2.8, H: 16, glass: true, ...o }),
  V6: (o = {}) =>
    new Vessel({ cx: 13.4, rx: 5.9, bx: 3.0, H: 7.5, wall: 'arc', foot: 0.9, body: C.glaze, ink: C.inkMatchaDark, ...o }),
  V7: (o = {}) => new Vessel({ cx: 10.4, rx: 4.5, bx: 3.95, H: 10, glass: true, handle: { w: 3.2 }, ...o }),
  V8: (o = {}) => new Vessel({ cx: 10.8, rx: 3.6, bx: 3.0, H: 10, foot: 0.6, ...o }),
};

// ---------------------------------------------------------------------------------------------
// Drawing routines

function drawSaucer(ic, v) {
  const { cx } = v;
  const { rx, t } = v.saucer;
  const sy = v.sy;
  const ex = rx * 0.92;
  const silhouette = [
    ['M', cx - rx, sy],
    ['A', rx, R * rx, 0, 0, 1, cx + rx, sy],
    ['L', cx + ex, sy + t],
    ['A', ex, R * ex, 0, 0, 1, cx - ex, sy + t],
    ['Z'],
  ];
  ic.path(silhouette, { fill: v.body });
  if (ic.L) {
    // shade on the saucer edge, right side
    ic.path(
      [
        ['M', cx + 0.44 * rx, sy + R * rx * Math.sqrt(1 - 0.44 ** 2)],
        ['A', ex, R * ex, 0, 0, 0, cx + ex, sy + t],
        ['L', cx + rx, sy],
        ['A', rx, R * rx, 0, 0, 1, cx + 0.44 * rx, sy + R * rx * Math.sqrt(1 - 0.44 ** 2)],
        ['Z'],
      ],
      { fill: shade(v.body) },
    );
  }
  ic.path(silhouette, ic.line(C.outline, ic.bw));
  // the saucer's top edge, front half, as a lighter line
  ic.path([['M', cx + rx, sy], ['A', rx, R * rx, 0, 0, 1, cx - rx, sy]], ic.line(C.outline, ic.dw));
}

function drawFoot(ic, v, color) {
  const { cx, bx, ywb, ybase } = v;
  const fx = bx * 0.86;
  ic.path(
    [
      ['M', cx - fx, ywb],
      ['L', cx - fx, ybase],
      ['A', fx, R * fx, 0, 0, 0, cx + fx, ybase],
      ['L', cx + fx, ywb],
      ['Z'],
    ],
    ic.solid(color ?? v.body, ic.bw),
  );
}

function drawHandle(ic, v) {
  const cmds = v.handleCmds();
  if (ic.L && !v.glass) {
    ic.path(cmds, ic.line(C.outline, ic.bw * 2 + 2.4));
    ic.path(cmds, ic.line(v.body, 2.4));
  } else {
    ic.path(cmds, ic.line(C.outline, ic.bw));
  }
}

function rimBack(ic, v, rx = v.rx, cy = v.yr) {
  ic.path([['M', v.cx - rx, cy], ['A', rx, R * rx, 0, 0, 1, v.cx + rx, cy]], ic.line(v.ink, ic.rw));
}
function rimFront(ic, v, rx = v.rx, cy = v.yr) {
  ic.path([['M', v.cx + rx, cy], ['A', rx, R * rx, 0, 0, 1, v.cx - rx, cy]], ic.line(v.ink, ic.rw));
}

// Opaque vessel (ceramic, enamel, chawan). `surface` paints the liquid inside the rim.
function drawOpaque(ic, v, { liquid, surface, flush = false, afterBody, aboveRim, overRim }) {
  if (v.saucer) drawSaucer(ic, v);
  if (v.foot) drawFoot(ic, v, v.body === C.glaze ? C.clay : v.body);
  if (v.handle) drawHandle(ic, v);
  ic.path(v.bodyCmds(), { fill: v.body });
  if (ic.L) ic.path(v.shadeCmds(), { fill: shade(v.body) });
  if (afterBody) afterBody(ic, v);
  if (ic.L) ic.path(v.gleamCmds(), ic.line(C.white, v.gleamWidth() * ic.k, { 'stroke-opacity': '0.85' }));
  ic.path(v.bodyCmds(false), ic.line(C.outline, ic.bw));
  // inside of the rim
  const { cx, yr, rx } = v;
  if (ic.L && !flush) {
    ic.ellipse(cx, yr, rx, R * rx, { fill: shade(v.body) });
    const drop = 0.45;
    const lrx = rx - 0.35;
    ic.ellipse(cx, yr + drop, lrx, R * lrx, { fill: liquid });
    if (surface) surface(ic, v, { cy: yr + drop, rx: lrx });
  } else {
    ic.ellipse(cx, yr, rx, R * rx, { fill: liquid });
    if (surface) surface(ic, v, { cy: yr, rx });
  }
  rimBack(ic, v);
  if (aboveRim) aboveRim(ic, v);
  rimFront(ic, v);
  if (overRim) overRim(ic, v);
}

// Glass vessel. layers: bottom to top [{ color, to }] where `to` is the fill fraction of the wall
// height at the top of that band. The top band's surface is a full ellipse; lower boundaries are
// front halves (DESIGN.md 3.1).
const GLASS_INSET = 0.4; // glass wall thickness seen through the side
const GLASS_FLOOR = 1.0; // thick glass bottom

function liquidHalf(v, y) {
  return v.halfAt(y) - GLASS_INSET;
}
function levelY(v, frac) {
  const floor = v.ywb - GLASS_FLOOR;
  return floor - frac * (floor - (v.yr + 0.3));
}

function bandCmds(v, yTop, top) {
  const { cx } = v;
  const floor = v.ywb - GLASS_FLOOR;
  const wt = liquidHalf(v, yTop);
  const wb = liquidHalf(v, floor);
  return [
    ['M', cx - wt, yTop],
    ['L', cx - wb, floor],
    ['A', wb, R * wb, 0, 0, 0, cx + wb, floor],
    ['L', cx + wt, yTop],
    ['A', wt, R * wt, 0, 0, top ? 0 : 1, cx - wt, yTop],
    ['Z'],
  ];
}
function bandShadeCmds(v, yTop) {
  const s = 0.44;
  const { cx } = v;
  const floor = v.ywb - GLASS_FLOOR;
  const wt = liquidHalf(v, yTop);
  const wb = liquidHalf(v, floor);
  const ft = [cx + s * wt, yTop + R * wt * Math.sqrt(1 - s * s)];
  const fb = [cx + s * wb, floor + R * wb * Math.sqrt(1 - s * s)];
  return [
    ['M', ...ft],
    ['L', ...fb],
    ['A', wb, R * wb, 0, 0, 0, cx + wb, floor],
    ['L', cx + wt, yTop],
    ['A', wt, R * wt, 0, 0, 1, ...ft],
    ['Z'],
  ];
}

function drawGlass(ic, v, { layers, inLiquid, aboveLiquid, straw, overRim, frontMarks }) {
  if (v.handle) drawHandle(ic, v);
  ic.path(v.bodyCmds(), { fill: C.glass, 'fill-opacity': '0.5' });
  // liquid, top band first so each lower band paints its front-half boundary over it
  const sorted = [...layers].sort((a, b) => b.to - a.to);
  sorted.forEach((band, i) => {
    const y = levelY(v, band.to);
    ic.path(bandCmds(v, y, i === 0), { fill: band.color });
    if (ic.L) ic.path(bandShadeCmds(v, y), { fill: shade(band.color) });
  });
  const top = levelY(v, sorted[0].to);
  if (inLiquid) inLiquid(ic, v, { y: top, half: liquidHalf(v, top) });
  if (ic.L) ic.path(v.gleamCmds(), ic.line(C.white, v.gleamWidth() * ic.k, { 'stroke-opacity': '0.85' }));
  rimBack(ic, v);
  if (aboveLiquid) aboveLiquid(ic, v, { y: top, half: liquidHalf(v, top) });
  if (straw) drawStraw(ic, v, top, straw);
  ic.path(v.bodyCmds(false), ic.line(C.outline, ic.bw));
  if (frontMarks) frontMarks(ic, v, { y: top, half: liquidHalf(v, top) });
  rimFront(ic, v);
  if (overRim) overRim(ic, v, { y: top, half: liquidHalf(v, top) });
}

function drawStraw(ic, v, yLiquid, { width = 1.5, color = C.orange } = {}) {
  const half = liquidHalf(v, yLiquid);
  const x0 = v.cx + 0.45 * half;
  const y0 = yLiquid + 0.2;
  const yTop = Math.max(2.2, v.yr - 7.2);
  const lean = Math.tan(12 * DEG);
  const x1 = x0 + lean * (y0 - yTop);
  // outline band, a touch longer at the top, then the straw colour
  const ext = 0.55;
  const dx = lean * ext;
  ic.path([['M', x0, y0], ['L', x1 + dx, yTop - ext]], { fill: 'none', stroke: C.outline, 'stroke-width': fmt((width + 1.1) * ic.k) });
  ic.path([['M', x0, y0], ['L', x1, yTop]], { fill: 'none', stroke: color, 'stroke-width': fmt(width * ic.k) });
}

// Fill a closed shape but stroke only its top contour (the base sits in the cup, unseen).
function mound(ic, top, close, color, w) {
  ic.path([...top, ...close, ['Z']], { fill: color });
  ic.path(top, ic.line(C.outline, w));
}

// --- shared marks --------------------------------------------------------------------------

function ice(ic, cx, cy, deg, size = 2.7) {
  ic.rrect(cx, cy, size, size, size * 0.24, deg, ic.solid(C.white, ic.dw, { 'fill-opacity': '0.7' }));
}
function bubbles(ic, pts) {
  // three circles, smaller as they rise
  pts.forEach(([x, y, r]) => ic.circle(x, y, r, { fill: C.white, 'fill-opacity': '0.6', stroke: C.bubble, 'stroke-opacity': '0.6', 'stroke-width': fmt(ic.dw * 0.9) }));
}

function wheel(ic, cx, cy, r, { rind, pith, flesh }) {
  ic.circle(cx, cy, r, ic.solid(rind));
  ic.circle(cx, cy, r - 0.55, { fill: pith });
  ic.circle(cx, cy, r - 0.95, { fill: flesh });
  const n = ic.L ? 8 : 4;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI) / n + Math.PI / 8;
    segs.push(['M', cx - Math.cos(a) * (r - 0.95), cy - Math.sin(a) * (r - 0.95)], ['L', cx + Math.cos(a) * (r - 0.95), cy + Math.sin(a) * (r - 0.95)]);
  }
  ic.path(segs, ic.line(pith, ic.L ? 1 : 0.5));
  ic.circle(cx, cy, r - 0.95 > 0.9 ? 0.45 : 0.3, { fill: pith });
}
// fruit wheel slotted on the rim's top right
function rimWheel(ic, v, fruit, r = 2.5) {
  wheel(ic, v.cx + v.rx + 0.1, v.yr - 1.6, r, fruit);
}
const ORANGE = { rind: C.rind, pith: C.pith, flesh: C.orange };
const LEMON = { rind: C.lemon, pith: C.pith, flesh: C.lemonade };
const LIME = { rind: C.mint, pith: C.ceramic, flesh: C.lime };

function leafShape(ic, cx, cy, len, wid, deg, color, { rib = true, ribColor } = {}) {
  // almond leaf along +x before rotation, base at (cx, cy)
  const a = deg * DEG;
  const rot = ([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  const tip = rot([len, 0]);
  const cmds = [
    ['M', cx, cy],
    ['C', ...rot([len * 0.3, -wid]), ...rot([len * 0.75, -wid * 0.8]), ...tip],
    ['C', ...rot([len * 0.75, wid * 0.8]), ...rot([len * 0.3, wid]), cx, cy],
    ['Z'],
  ];
  ic.path(cmds, ic.solid(color));
  if (rib) ic.path([['M', cx, cy], ['L', ...rot([len * 0.78, 0])]], ic.line(ribColor ?? C.outline, ic.dw * 0.6, ribColor ? {} : { 'stroke-opacity': '0.5' }));
}

function flower(ic, cx, cy, n, petalLen, petalW, petal, centre, centreR, deg0 = -90) {
  for (let i = 0; i < n; i++) {
    const a = deg0 + (360 * i) / n;
    ic.ellipse(cx + Math.cos(a * DEG) * petalLen * 0.55, cy + Math.sin(a * DEG) * petalLen * 0.55, petalLen * 0.55, petalW / 2, {
      ...ic.solid(petal, ic.dw * 0.8),
      transform: `rotate(${fmt(a)} ${ic.n(cx + Math.cos(a * DEG) * petalLen * 0.55)} ${ic.n(cy + Math.sin(a * DEG) * petalLen * 0.55)})`,
    });
  }
  ic.circle(cx, cy, centreR, ic.solid(centre, ic.dw * 0.8));
}

function star(ic, cx, cy, n, rOut, rIn, color, deg0 = -90) {
  const cmds = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = (deg0 + (180 * i) / n) * DEG;
    cmds.push([i ? 'L' : 'M', cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  cmds.push(['Z']);
  ic.path(cmds, ic.solid(color, ic.dw * 0.6));
  // seed pods: one dot per arm at L
  if (ic.L) {
    for (let i = 0; i < n; i++) {
      const a = (deg0 + (360 * i) / n) * DEG;
      ic.circle(cx + Math.cos(a) * rOut * 0.55, cy + Math.sin(a) * rOut * 0.55, 0.28, { fill: C.cinnamon });
    }
  }
  ic.circle(cx, cy, rIn * 0.45, { fill: C.cinnamon });
}

function teaTag(ic, v, { from, tagX, tagY }) {
  // steel string from the bag inside the cup, over the rim at front right, down to a paper tag
  const over = [v.cx + v.rx * 0.62, v.yr + R * v.rx * 0.78];
  ic.path(
    [
      ['M', ...from],
      ['Q', over[0] - 0.3, over[1] - 1.0, ...over],
      ['Q', tagX + 0.2, over[1] + 0.4, tagX, tagY - 1.2],
    ],
    ic.line(C.steel, ic.L ? 1.2 : 0.7),
  );
  ic.rrect(tagX, tagY + 0.1, 2.4, 2.8, 0.25, -4, ic.solid(C.tag));
  ic.circle(tagX, tagY - 0.7, 0.28, { fill: C.steel });
}

function mangoCube(ic, x, y, s = ic.L ? 2.6 : 3.0) {
  ic.rrect(x, y, s, s, s * 0.22, 14, ic.solid(C.mango));
  // a cube, seen from above: show a top face line
  if (ic.L) ic.path([['M', x - s * 0.32, y - s * 0.1], ['L', x + s * 0.35, y - s * 0.02]], ic.line(C.outline, ic.dw * 0.5, { 'stroke-opacity': '0.35' }));
}

// ---------------------------------------------------------------------------------------------
// Special vessels: V9 gaiwan, V10 dripper on cup, V11 cold-press bottle

function drawGaiwan(ic, liquid) {
  // V9: a deep lidded bowl on a saucer. The lid sits inside the rim, tilted 10 degrees so its
  // left edge lifts and a crescent of tea shows underneath.
  const v = new Vessel({ cx: 11.2, rx: 4.6, bx: 2.3, H: 8.4, wall: 'arc', foot: 0.5, saucer: { rx: 6.6, t: 0.8 }, ink: C.inkTea });
  drawSaucer(ic, v);
  drawFoot(ic, v);
  ic.path(v.bodyCmds(), { fill: v.body });
  if (ic.L) ic.path(v.shadeCmds(), { fill: shade(v.body) });
  if (ic.L) ic.path(v.gleamCmds(), ic.line(C.white, v.gleamWidth() * ic.k, { 'stroke-opacity': '0.85' }));
  ic.path(v.bodyCmds(false), ic.line(C.outline, ic.bw));
  ic.ellipse(v.cx, v.yr, v.rx, R * v.rx, { fill: liquid });
  rimBack(ic, v);
  rimFront(ic, v);
  // lid
  const lrx = 4.1;
  const pivot = [v.cx + v.rx - 0.1, v.yr - 0.45];
  const lcx = pivot[0] - lrx;
  const lcy = pivot[1];
  const domeH = 1.9;
  const lidTop = [
    ['M', lcx - lrx, lcy],
    ['C', lcx - lrx, lcy - domeH * 0.8, lcx - lrx * 0.5, lcy - domeH, lcx, lcy - domeH],
    ['C', lcx + lrx * 0.5, lcy - domeH, lcx + lrx, lcy - domeH * 0.8, lcx + lrx, lcy],
  ];
  const lidFront = [['A', lrx, R * lrx, 0, 0, 1, lcx - lrx, lcy]];
  const g = [];
  g.push(`<path d="${ic.d([...lidTop, ...lidFront, ['Z']])}" fill="${v.body}"/>`);
  if (ic.L) {
    const sx = lcx + 0.44 * lrx;
    const sy = lcy + R * lrx * 0.898;
    g.push(
      `<path d="${ic.d([
        ['M', sx, sy],
        ['C', sx, lcy - domeH * 0.5, sx - 0.3, lcy - domeH * 0.95, sx - 0.9, lcy - domeH * 0.99],
        ['C', lcx + lrx * 0.7, lcy - domeH, lcx + lrx, lcy - domeH * 0.8, lcx + lrx, lcy],
        ['A', lrx, R * lrx, 0, 0, 1, sx, sy],
        ['Z'],
      ])}" fill="${shade(v.body)}"/>`,
    );
  }
  g.push(`<path d="${ic.d(lidTop)}"${attrStr(ic.line(C.outline, ic.bw))}/>`);
  // the lid's edge, front half
  g.push(`<path d="${ic.d([["M", lcx + lrx, lcy], ...lidFront])}"${attrStr(ic.line(C.outline, ic.dw))}/>`);
  // knob: a short cylinder
  const kr = 1.05;
  const kb = lcy - domeH + 0.2;
  const kt = kb - 1.0;
  g.push(
    `<path d="${ic.d([
      ['M', lcx - kr, kt],
      ['L', lcx - kr, kb],
      ['A', kr, R * kr, 0, 0, 0, lcx + kr, kb],
      ['L', lcx + kr, kt],
      ['A', kr, R * kr, 0, 0, 0, lcx - kr, kt],
      ['Z'],
    ])}"${attrStr(ic.solid(v.body, ic.dw))}/>`,
  );
  ic.add(`<g transform="rotate(-10 ${ic.n(pivot[0])} ${ic.n(pivot[1])})">${g.join('')}</g>`);
}

function drawDripper(ic) {
  // short cup
  const cup = new Vessel({ cx: 11.2, rx: 4.2, bx: 3.6, H: 6.2, foot: 0.5 });
  drawFoot(ic, cup);
  ic.path(cup.bodyCmds(), { fill: cup.body });
  if (ic.L) ic.path(cup.shadeCmds(), { fill: shade(cup.body) });
  ic.path(cup.bodyCmds(false), ic.line(C.outline, ic.bw));
  ic.ellipse(cup.cx, cup.yr, cup.rx, R * cup.rx, { fill: C.black });
  rimBack(ic, cup);
  rimFront(ic, cup);
  // dripper: flat plate on the cup, cone above. Its rim is the drink's rim line.
  const d = new Vessel({ cx: 11.2, rx: 5.3, bx: 1.7, H: 15, wall: 'straight' });
  // move the cone base to sit on the plate
  const plateY = cup.yr - 0.6;
  const plateRx = 4.9;
  ic.ellipse(cup.cx, plateY, plateRx, R * plateRx, ic.solid(C.ceramic, ic.bw));
  if (ic.L) ic.path([['M', cup.cx - plateRx + 0.5, plateY + 0.25], ['A', plateRx - 0.5, R * (plateRx - 0.5), 0, 0, 0, cup.cx + plateRx - 0.5, plateY + 0.25]], ic.line(shade(C.ceramic), 0.6 * ic.k));
  const cone = new Vessel({ cx: 11.2, rx: 5.3, bx: 1.8, H: 15, wall: 'straight' });
  cone.ywb = plateY - 0.5;
  cone.yr = 21 - 15 + R * 5.3;
  const p0 = [cone.cx + cone.rx, cone.yr];
  const p3 = [cone.cx + cone.bx, cone.ywb];
  cone.wr = [p0, [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3], [p0[0] + (2 * (p3[0] - p0[0])) / 3, p0[1] + (2 * (p3[1] - p0[1])) / 3], p3];
  ic.path(cone.bodyCmds(), { fill: C.ceramic });
  if (ic.L) ic.path(cone.shadeCmds(), { fill: shade(C.ceramic) });
  if (ic.L) ic.path(cone.gleamCmds(0.22, 0.6), ic.line(C.white, cone.gleamWidth() * ic.k * 0.8, { 'stroke-opacity': '0.85' }));
  // two ribs on the front face
  [-0.42, 0.3].forEach((s) => {
    const a = cone.T(p0, s);
    const b = cone.T(p3, s);
    const t0 = 0.22;
    const t1 = 0.78;
    ic.path([['M', a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], ['L', a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]], ic.line(C.outline, ic.dw * 0.8));
  });
  ic.path(cone.bodyCmds(false), ic.line(C.outline, ic.bw));
  // inner back wall, then the coffee bed
  if (ic.L) ic.ellipse(cone.cx, cone.yr, cone.rx, R * cone.rx, { fill: shade(C.ceramic) });
  const bed = ic.L ? cone.rx - 0.7 : cone.rx;
  ic.ellipse(cone.cx, cone.yr + (ic.L ? 0.6 : 0), bed, R * bed, { fill: C.black });
  if (!ic.L) ic.ellipse(cone.cx, cone.yr, cone.rx, R * cone.rx, { fill: C.black });
  rimBack(ic, cone);
  rimFront(ic, cone);
}

function drawBottle(ic) {
  // V11 cold-press bottle: straight glass body, shoulder, short neck, flat cap.
  const cx = 11.2;
  const bx = 3.4;
  const yb = 21 - R * bx; // base ellipse centre
  const ys = 9.2; // shoulder start
  const nx = 1.75; // neck half width
  const yn = 6.8; // neck top
  const capTop = 4.2;
  const capX = 2.05;
  const body = [
    ['M', cx - bx, ys],
    ['L', cx - bx, yb],
    ['A', bx, R * bx, 0, 0, 0, cx + bx, yb],
    ['L', cx + bx, ys],
    ['C', cx + bx, ys - 1.4, cx + nx, ys - 1.2, cx + nx, ys - 2.0],
    ['L', cx + nx, yn],
    ['L', cx - nx, yn],
    ['L', cx - nx, ys - 2.0],
    ['C', cx - nx, ys - 1.2, cx - bx, ys - 1.4, cx - bx, ys],
    ['Z'],
  ];
  ic.path(body, { fill: C.glass, 'fill-opacity': '0.5' });
  // liquid: fills the body to just under the shoulder
  const lx = bx - GLASS_INSET;
  const ly = ys + 0.4;
  const fl = yb - 0.8;
  const liq = [
    ['M', cx - lx, ly],
    ['L', cx - lx, fl],
    ['A', lx, R * lx, 0, 0, 0, cx + lx, fl],
    ['L', cx + lx, ly],
    ['A', lx, R * lx, 0, 0, 0, cx - lx, ly],
    ['Z'],
  ];
  ic.path(liq, { fill: C.carrot });
  if (ic.L) {
    const s = 0.44;
    ic.path(
      [
        ['M', cx + s * lx, ly + R * lx * 0.898],
        ['L', cx + s * lx, fl + R * lx * 0.898],
        ['A', lx, R * lx, 0, 0, 0, cx + lx, fl],
        ['L', cx + lx, ly],
        ['A', lx, R * lx, 0, 0, 1, cx + s * lx, ly + R * lx * 0.898],
        ['Z'],
      ],
      { fill: shade(C.carrot) },
    );
    const gx = cx - 0.57 * bx;
    const gy = R * bx * 0.82;
    const h = yb - ys;
    ic.path([['M', gx, ys + 0.3 * h + gy], ['L', gx, ys + 0.7 * h + gy]], ic.line(C.white, 0.07 * 2 * bx * ic.k, { 'stroke-opacity': '0.85' }));
  }
  ic.path(body, ic.line(C.outline, ic.bw));
  // cap: flat, dark, its top ellipse is the rim line
  const capBot = yn + 0.3;
  const cap = [
    ['M', cx - capX, capTop],
    ['L', cx - capX, capBot],
    ['A', capX, R * capX, 0, 0, 0, cx + capX, capBot],
    ['L', cx + capX, capTop],
    ['Z'],
  ];
  ic.path(cap, ic.solid(C.cap, ic.bw));
  if (ic.L) ic.path([['M', cx - capX * 0.35, capTop + 0.7], ['L', cx - capX * 0.35, capBot - 0.2]], ic.line(C.steel, 0.5 * ic.k));
  ic.ellipse(cx, capTop, capX, R * capX, { fill: C.cap, ...ic.line(C.inkSmoothie, ic.rw) , fill: C.cap });
}

// ---------------------------------------------------------------------------------------------
// The 42 drinks (DESIGN.md 3.4, ids from COPY.md 2.2 to 2.6)

const D = {};

// --- Coffee ----------------------------------------------------------------------------------
D['coffee.espresso'] = (ic) => {
  const v = V.V1();
  drawOpaque(ic, v, {
    liquid: C.crema,
    surface: (ic, v, s) => ic.ellipse(v.cx - 0.1, s.cy + 0.08, s.rx * 0.62, R * s.rx * 0.62, { fill: C.espresso }),
  });
};
D['coffee.americano'] = (ic) => {
  drawOpaque(ic, V.V3(), { liquid: C.black, flush: true });
};
D['coffee.filter'] = (ic) => drawDripper(ic);
D['coffee.cappuccino'] = (ic) => {
  const v = V.V2();
  drawOpaque(ic, v, {
    liquid: C.foam,
    flush: true,
    aboveRim: (ic, v) => {
      const { cx, yr, rx } = v;
      const h = 2.3;
      const r = rx - 0.35;
      mound(
        ic,
        [
          ['M', cx - r, yr],
          ['C', cx - r, yr - h * 0.95, cx - r * 0.45, yr - h, cx, yr - h],
          ['C', cx + r * 0.45, yr - h, cx + r, yr - h * 0.95, cx + r, yr],
        ],
        [['A', r, R * r, 0, 0, 1, cx - r, yr]],
        C.foam,
        ic.dw,
      );
      if (ic.L)
        ic.path([['M', cx + r * 0.44, yr + 0.1], ['C', cx + r * 0.44, yr - h * 0.6, cx + r * 0.3, yr - h * 0.9, cx + r * 0.1, yr - h * 0.98], ['C', cx + r * 0.5, yr - h, cx + r * 0.98, yr - h * 0.9, cx + r - 0.1, yr], ['Z']], { fill: shade(C.foam) });
      // three cocoa dots
      [
        [-1.6, -1.45, 0.55],
        [0.2, -1.85, 0.55],
        [1.7, -1.2, 0.55],
      ].forEach(([dx, dy, rr]) => ic.circle(cx + dx, yr + dy, rr, { fill: C.chocolate }));
    },
  });
};
D['coffee.latte'] = (ic) => {
  drawGlass(ic, V.V5(), {
    layers: [
      { color: C.milkCoffee, to: 0.72 },
      { color: C.foam, to: 0.92 },
    ],
  });
};
D['coffee.flat_white'] = (ic) => {
  const v = V.V2({ scale: 0.9, cx: 10.8 });
  drawOpaque(ic, v, {
    liquid: C.foam,
    flush: true,
    surface: (ic, v, s) => {
      // tulip: three stacked marks in milk coffee, drawn flat on the 0.30 surface
      const { cx } = v;
      const cy = s.cy + 0.05;
      const w = s.rx * 0.5;
      if (ic.L) {
        [0, 1, 2].forEach((i) => {
          const ww = w * (1 - i * 0.22);
          const yy = cy + 0.45 - i * 0.5;
          ic.path([['M', cx - ww, yy], ['Q', cx, yy + 0.9 - i * 0.1, cx + ww, yy], ['Q', cx, yy - 0.5, cx - ww, yy], ['Z']], { fill: C.milkCoffee });
        });
      } else {
        ic.path([['M', cx - w, cy - 0.1], ['Q', cx, cy + 0.9, cx + w, cy - 0.1], ['Q', cx, cy + 0.2, cx - w, cy - 0.1], ['Z']], { fill: C.milkCoffee });
      }
    },
  });
};
D['coffee.cortado'] = (ic) => {
  drawGlass(ic, V.V4(), {
    layers: [
      { color: C.espresso, to: 0.42 },
      { color: C.foam, to: 0.84 },
    ],
  });
};
D['coffee.macchiato'] = (ic) => {
  const v = V.V1();
  drawOpaque(ic, v, {
    liquid: C.espresso,
    aboveRim: (ic, v) => {
      // a spoonful of foam: a small mound sitting in the middle of the surface
      const { cx, yr } = v;
      const r = 1.55;
      mound(
        ic,
        [
          ['M', cx - r, yr + 0.15],
          ['C', cx - r, yr - 1.3, cx - 0.4, yr - 1.5, cx, yr - 1.5],
          ['C', cx + 0.4, yr - 1.5, cx + r, yr - 1.3, cx + r, yr + 0.15],
        ],
        [['A', r, R * r, 0, 0, 1, cx - r, yr + 0.15]],
        C.foam,
        ic.dw,
      );
    },
  });
};
D['coffee.mocha'] = (ic) => {
  const v = V.V3();
  drawOpaque(ic, v, {
    liquid: C.chocolate,
    flush: true,
    aboveRim: (ic, v) => {
      // cream peak: a soft cone that ends in a curl, plus a zigzag drizzle
      const { cx, yr, rx } = v;
      const r = rx - 0.6;
      const top = yr - 4.6;
      mound(
        ic,
        [
          ['M', cx - r, yr + 0.2],
          ['C', cx - r, yr - 1.8, cx - 1.4, yr - 2.4, cx - 0.9, top + 1.6],
          ['C', cx - 0.6, top + 0.7, cx + 0.1, top + 0.3, cx + 0.7, top],
          ['C', cx + 0.7, top + 1.0, cx + 1.4, yr - 2.4, cx + r, yr - 1.0],
          ['C', cx + r + 0.3, yr - 0.5, cx + r, yr + 0.1, cx + r, yr + 0.2],
        ],
        [['A', r, R * r, 0, 0, 1, cx - r, yr + 0.2]],
        C.foam,
        ic.bw,
      );
      if (ic.L) ic.path([['M', cx + 1.6, yr + 0.3], ['C', cx + 1.4, yr - 1.2, cx + 1.2, yr - 2.0, cx + 1.25, yr - 2.4], ['C', cx + 2.4, yr - 1.8, cx + r + 0.25, yr - 0.8, cx + r, yr + 0.2], ['Z']], { fill: shade(C.foam) });
      ic.path(
        [
          ['M', cx - r + 0.7, yr - 0.6],
          ['L', cx - 1.3, yr - 2.0],
          ['L', cx - 0.3, yr - 0.9],
          ['L', cx + 0.6, yr - 2.4],
          ['L', cx + 1.5, yr - 1.0],
          ['L', cx + r - 0.6, yr - 1.9],
        ],
        ic.line(C.chocolate, ic.L ? 2.2 : 1),
      );
    },
  });
};
D['coffee.cold_brew'] = (ic) => {
  drawGlass(ic, V.V5(), {
    layers: [{ color: C.black, to: 0.86 }],
    inLiquid: (ic, v, { y }) => {
      ice(ic, v.cx - 0.7, y + 0.1, 8);
      ice(ic, v.cx + 0.9, y + 3.2, 14);
    },
  });
};

// --- Matcha ----------------------------------------------------------------------------------
const MV = (f, o = {}) => f({ ink: C.inkMatcha, ...o });

D['matcha.latte'] = (ic) => {
  const v = MV(V.V2);
  drawOpaque(ic, v, {
    liquid: C.matchaMilk,
    flush: true,
    surface: (ic, v, s) => {
      // leaf (rosetta) mark in milk, lying on the surface
      const { cx } = v;
      const cy = s.cy + 0.1;
      const w = s.rx * 0.62;
      ic.path(
        [
          ['M', cx - w, cy],
          ['Q', cx - w * 0.2, cy - R * w * 1.4, cx + w, cy],
          ['Q', cx - w * 0.2, cy + R * w * 1.4, cx - w, cy],
          ['Z'],
        ],
        { fill: C.milk },
      );
      if (ic.L) ic.path([['M', cx - w * 0.7, cy], ['L', cx + w * 0.8, cy]], ic.line(C.matchaMilk, 0.9));
    },
  });
};
D['matcha.ceremonial'] = (ic) => {
  const v = V.V6();
  // chasen (whisk) standing at the left of the bowl
  const wx = 3.9;
  const handleTop = 9.2;
  const tineTop = 14.6;
  const base = 21 - 0.6;
  const drawWhisk = () => {
    // tines: a flared bundle that curls inward at the top
    const tw = 2.1;
    ic.path(
      [
        ['M', wx - 1.0, tineTop + 0.3],
        ['C', wx - tw, tineTop + 1.6, wx - tw, base - 0.6, wx - 1.1, base],
        ['A', 1.1, R * 1.1, 0, 0, 0, wx + 1.1, base],
        ['C', wx + tw, base - 0.6, wx + tw, tineTop + 1.6, wx + 1.0, tineTop + 0.3],
        ['Z'],
      ],
      ic.solid(C.bamboo, ic.bw * 0.9),
    );
    if (ic.L) {
      [-0.55, 0, 0.55].forEach((dx) => ic.path([['M', wx + dx * 0.6, tineTop + 1.2], ['Q', wx + dx * 2.6, (tineTop + base) / 2, wx + dx * 1.4, base - 0.3]], ic.line(C.outline, ic.dw * 0.5, { 'stroke-opacity': '0.45' })));
    }
    // handle
    ic.path([['M', wx - 0.7, handleTop], ['L', wx - 0.7, tineTop + 0.6], ['L', wx + 0.7, tineTop + 0.6], ['L', wx + 0.7, handleTop], ['Z']], ic.solid(C.bamboo, ic.bw * 0.9));
    ic.ellipse(wx, handleTop, 0.7, R * 0.7, ic.solid(C.bamboo, ic.dw * 0.8));
  };
  drawWhisk();
  drawOpaque(ic, v, {
    liquid: C.froth,
    afterBody: (ic, v) => {
      // drip band: lighter glaze falling from the rim in three tongues
      const { cx, yr, rx } = v;
      const pts = [];
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const u = -1 + (2 * i) / N;
        const x = cx + u * rx * 0.99;
        const yRim = yr + R * rx * Math.sqrt(Math.max(0, 1 - u * u));
        const tongues = [-0.55, 0.05, 0.6].reduce((m, c) => Math.max(m, Math.exp(-((u - c) ** 2) / 0.012)), 0);
        const drop = (0.9 + 1.25 * tongues) * Math.sqrt(Math.max(0, 1 - u * u));
        pts.push([x, yRim + drop]);
      }
      const cmds = [['M', cx - rx, yr], ['A', rx, R * rx, 0, 0, 0, cx + rx, yr]];
      for (let i = pts.length - 1; i >= 0; i--) cmds.push(['L', ...pts[i]]);
      cmds.push(['Z']);
      ic.path(cmds, { fill: C.drip });
    },
    surface: (ic, v, s) => {
      // three micro-bubbles clustered toward the back edge
      const { cx } = v;
      [
        [-1.5, -0.25, 0.42],
        [0.2, -0.45, 0.34],
        [1.7, -0.2, 0.28],
      ].forEach(([dx, dy, r]) => ic.circle(cx + dx * (s.rx / 5.9), s.cy + dy * (ic.L ? 1.8 : 1), r * (ic.L ? 1.3 : 1.25), { fill: C.frothBubble }));
    },
  });
};
D['matcha.strawberry'] = (ic) => {
  drawGlass(ic, MV(V.V5), {
    layers: [
      { color: C.strawPuree, to: 0.3 },
      { color: C.milk, to: 0.58 },
      { color: C.matcha, to: 0.86 },
    ],
  });
};
D['matcha.dirty'] = (ic) => {
  drawGlass(ic, MV(V.V4), {
    layers: [
      { color: C.matchaMilk, to: 0.66 },
      { color: C.espresso, to: 0.86 },
    ],
  });
};
D['matcha.hojicha'] = (ic) => {
  const v = MV(V.V2);
  drawOpaque(ic, v, {
    liquid: C.milk,
    flush: true,
    surface: (ic, v, s) => ic.ellipse(v.cx, s.cy + 0.05, s.rx * 0.66, R * s.rx * 0.66, { fill: C.hojicha }),
    overRim: (ic, v) => leafShape(ic, v.cx + v.rx - 1.6, v.yr - 0.3, 4.2, 1.35, -38, C.cinnamon, { ribColor: C.hojicha }),
  });
};
D['matcha.coconut'] = (ic) => {
  drawGlass(ic, MV(V.V5), {
    layers: [
      { color: C.water, to: 0.5 },
      { color: C.matcha, to: 0.86 },
    ],
    inLiquid: (ic, v, { y }) => {
      ice(ic, v.cx - 0.7, y + 0.1, 8);
      ice(ic, v.cx + 0.9, y + 3.2, 14);
    },
  });
};
D['matcha.lemonade'] = (ic) => {
  drawGlass(ic, MV(V.V4), {
    layers: [
      { color: C.lemonade, to: 0.5 },
      { color: C.matcha, to: 0.86 },
    ],
    overRim: (ic, v) => rimWheel(ic, v, LEMON),
  });
};
D['matcha.tonic'] = (ic) => {
  drawGlass(ic, MV(V.V5), {
    layers: [
      { color: C.water, to: 0.6 },
      { color: C.matcha, to: 0.86 },
    ],
    frontMarks: (ic, v) => {
      const b = v.ywb - GLASS_FLOOR;
      bubbles(ic, [
        [v.cx - 0.9, b - 1.4, 0.75],
        [v.cx + 0.6, b - 3.8, 0.6],
        [v.cx - 0.4, b - 5.8, 0.45],
      ]);
    },
    overRim: (ic, v) => rimWheel(ic, v, LIME),
  });
};
D['matcha.blended'] = (ic) => {
  drawGlass(ic, MV(V.V5), {
    layers: [{ color: C.matchaMilk, to: 0.9 }],
    straw: {},
  });
};
D['matcha.mango'] = (ic) => {
  drawGlass(ic, MV(V.V5), {
    layers: [
      { color: C.mango, to: 0.4 },
      { color: C.matchaMilk, to: 0.86 },
    ],
    overRim: (ic, v) => mangoCube(ic, v.cx + v.rx + 0.2, v.yr - 1.3),
  });
};

// --- Tea -------------------------------------------------------------------------------------
const TV = (f, o = {}) => f({ ink: C.inkTea, ...o });

D['tea.english_breakfast'] = (ic) => {
  const v = TV(V.V3);
  drawOpaque(ic, v, {
    liquid: C.milkyTea,
    flush: true,
    overRim: (ic, v) => teaTag(ic, v, { from: [v.cx + 0.8, v.yr + 0.1], tagX: v.cx + 1.9, tagY: v.yr + 4.2 }),
  });
};
D['tea.earl_grey'] = (ic) => {
  const v = TV(V.V2);
  drawOpaque(ic, v, {
    liquid: C.blackTea,
    flush: true,
    overRim: (ic, v) => teaTag(ic, v, { from: [v.cx + 1.0, v.yr + 0.1], tagX: v.cx + 2.0, tagY: v.yr + 3.3 }),
  });
};
D['tea.green'] = (ic) => {
  const v = TV(V.V8);
  drawOpaque(ic, v, {
    liquid: C.greenTea,
    overRim: (ic, v) => leafShape(ic, v.cx + v.rx - 1.4, v.yr - 0.3, 5.2, 1.6, -42, C.leaf, { ribColor: C.peppermint }),
  });
};
D['tea.jasmine'] = (ic) => {
  const v = TV(V.V8);
  drawOpaque(ic, v, {
    liquid: C.jasmine,
    overRim: (ic, v) => flower(ic, v.cx + v.rx + 0.4, v.yr - 2.0, 5, 2.6, 1.9, C.jasminePetal, C.lemon, 0.6),
  });
};
D['tea.oolong'] = (ic) => drawGaiwan(ic, C.oolong);
D['tea.chai_latte'] = (ic) => {
  drawGlass(ic, TV(V.V4), {
    layers: [
      { color: C.chai, to: 0.7 },
      { color: C.foam, to: 0.88 },
    ],
    overRim: (ic, v) => star(ic, v.cx + v.rx - 0.2, v.yr - 1.6, 8, 2.6, 1.05, C.anise),
  });
};
D['tea.bubble'] = (ic) => {
  drawGlass(ic, TV(V.V5), {
    layers: [{ color: C.milkyTea, to: 0.86 }],
    straw: { width: 2.3 },
    frontMarks: (ic, v) => {
      const b = v.ywb - GLASS_FLOOR;
      const r = 0.72;
      [
        [-1.75, -0.35],
        [-0.25, 0.15],
        [1.25, -0.25],
        [-1.0, -1.55],
        [0.6, -1.4],
      ].forEach(([dx, dy]) => ic.circle(v.cx + dx * 0.92, b + dy, r, ic.L ? { fill: C.espresso } : { fill: C.espresso }));
    },
  });
};
D['tea.peppermint'] = (ic) => {
  drawGlass(ic, TV(V.V7), {
    layers: [{ color: C.peppermint, to: 0.8 }],
    overRim: (ic, v) => {
      const x = v.cx + v.rx - 1.0;
      const y = v.yr - 0.2;
      leafShape(ic, x, y, 4.0, 1.35, -70, C.mint, { ribColor: C.lime });
      leafShape(ic, x + 0.2, y + 0.1, 4.0, 1.35, -22, C.mint, { ribColor: C.lime });
    },
  });
};
D['tea.chamomile'] = (ic) => {
  drawGlass(ic, TV(V.V7), {
    layers: [{ color: C.chamomile, to: 0.8 }],
    overRim: (ic, v) => flower(ic, v.cx + v.rx + 0.2, v.yr - 2.0, ic.L ? 10 : 8, 2.6, ic.L ? 1.0 : 1.1, C.petal, C.petalCentre, 1.0),
  });
};
D['tea.ginger_lemon'] = (ic) => {
  drawGlass(ic, TV(V.V7), {
    layers: [{ color: C.gingerLemon, to: 0.8 }],
    overRim: (ic, v) => rimWheel(ic, v, LEMON),
  });
};

// --- Smoothie & Juice ------------------------------------------------------------------------
const SV = (f, o = {}) => f({ ink: C.inkSmoothie, ...o });

D['smoothie_juice.orange'] = (ic) => {
  drawGlass(ic, SV(V.V5), { layers: [{ color: C.orange, to: 0.85 }], overRim: (ic, v) => rimWheel(ic, v, ORANGE) });
};
D['smoothie_juice.green_juice'] = (ic) => {
  drawGlass(ic, SV(V.V4), {
    layers: [{ color: C.greenSmoothie, to: 0.82 }],
    overRim: (ic, v) => {
      // apple slice: a crescent wedge, red skin on the outer curve, two seeds
      const cx = v.cx + v.rx - 0.2;
      const cy = v.yr - 1.4;
      const g = [];
      const r = 2.7;
      const wedge = ic.d([
        ['M', cx - r, cy],
        ['A', r, r, 0, 0, 1, cx + r, cy],
        ['Q', cx, cy + 1.6, cx - r, cy],
        ['Z'],
      ]);
      const flesh = ic.d([
        ['M', cx - r + 0.55, cy + 0.05],
        ['A', r - 0.55, r - 0.55, 0, 0, 1, cx + r - 0.55, cy + 0.05],
        ['Q', cx, cy + 1.35, cx - r + 0.55, cy + 0.05],
        ['Z'],
      ]);
      g.push(`<path d="${wedge}"${attrStr(ic.solid(C.appleSkin))}/>`);
      g.push(`<path d="${flesh}" fill="${C.pith}"/>`);
      g.push(`<ellipse cx="${ic.n(cx - 0.55)}" cy="${ic.n(cy - 0.75)}" rx="${ic.n(0.28)}" ry="${ic.n(0.45)}" fill="${C.bean}" transform="rotate(-20 ${ic.n(cx - 0.55)} ${ic.n(cy - 0.75)})"/>`);
      g.push(`<ellipse cx="${ic.n(cx + 0.55)}" cy="${ic.n(cy - 0.75)}" rx="${ic.n(0.28)}" ry="${ic.n(0.45)}" fill="${C.bean}" transform="rotate(20 ${ic.n(cx + 0.55)} ${ic.n(cy - 0.75)})"/>`);
      ic.add(`<g transform="rotate(28 ${ic.n(cx)} ${ic.n(cy)})">${g.join('')}</g>`);
    },
  });
};
D['smoothie_juice.green_smoothie'] = (ic) => {
  drawGlass(ic, SV(V.V5), { layers: [{ color: C.greenSmoothie, to: 0.85 }], straw: {} });
};
D['smoothie_juice.berry'] = (ic) => {
  drawGlass(ic, SV(V.V5), {
    layers: [{ color: C.berry, to: 0.85 }],
    straw: {},
    frontMarks: (ic, v, { y }) => {
      if (!ic.L) return;
      [
        [-1.4, 3],
        [0.9, 5.5],
        [-0.6, 8.2],
        [1.2, 10.3],
        [-1.6, 11.2],
      ].forEach(([dx, dy]) => ic.circle(v.cx + dx, y + dy, 0.22, { fill: C.berrySeed }));
    },
    overRim: (ic, v) => {
      const x = v.cx + v.rx + 1.3;
      const y = v.yr - 0.9;
      [
        [-1.05, 0.45],
        [1.05, 0.45],
        [0, -1.3],
      ].forEach(([dx, dy]) => {
        ic.circle(x + dx, y + dy, 1.25, ic.solid(C.raspberry));
        if (ic.L) ic.circle(x + dx - 0.35, y + dy - 0.4, 0.28, { fill: C.white, 'fill-opacity': '0.6' });
      });
    },
  });
};
D['smoothie_juice.strawberry_banana'] = (ic) => {
  drawGlass(ic, SV(V.V4), {
    layers: [{ color: C.banana, to: 0.84 }],
    straw: {},
    overRim: (ic, v) => {
      // strawberry: rounded heart shape, point down, leafy cap, pith seeds
      const x = v.cx + v.rx + 0.1;
      const y = v.yr - 1.3;
      const g = [];
      g.push(
        `<path d="${ic.d([
          ['M', x, y + 2.3],
          ['C', x - 1.5, y + 1.6, x - 2.3, y + 0.2, x - 2.0, y - 0.7],
          ['C', x - 1.7, y - 1.6, x - 0.6, y - 1.4, x, y - 1.0],
          ['C', x + 0.6, y - 1.4, x + 1.7, y - 1.6, x + 2.0, y - 0.7],
          ['C', x + 2.3, y + 0.2, x + 1.5, y + 1.6, x, y + 2.3],
          ['Z'],
        ])}"${attrStr(ic.solid(C.strawberry))}/>`,
      );
      g.push(
        `<path d="${ic.d([
          ['M', x - 1.5, y - 1.0],
          ['L', x - 0.6, y - 1.3],
          ['L', x, y - 2.2],
          ['L', x + 0.6, y - 1.3],
          ['L', x + 1.5, y - 1.0],
          ['L', x, y - 0.6],
          ['Z'],
        ])}"${attrStr(ic.solid(C.mint))}/>`,
      );
      const seeds = ic.L
        ? [
            [-0.9, 0],
            [0.1, 0.25],
            [1.0, -0.1],
            [-0.4, 1.1],
            [0.6, 1.1],
          ]
        : [
            [-0.8, 0.1],
            [0.8, 0.1],
            [0, 1.0],
          ];
      seeds.forEach(([dx, dy]) => g.push(`<circle cx="${ic.n(x + dx)}" cy="${ic.n(y + dy)}" r="${ic.n(ic.L ? 0.2 : 0.3)}" fill="${C.pith}"/>`));
      ic.add(`<g transform="rotate(18 ${ic.n(x)} ${ic.n(y)})">${g.join('')}</g>`);
    },
  });
};
D['smoothie_juice.mango'] = (ic) => {
  drawGlass(ic, SV(V.V5), {
    layers: [{ color: C.mango, to: 0.85 }],
    straw: {},
    overRim: (ic, v) => mangoCube(ic, v.cx + v.rx + 0.2, v.yr - 1.3),
  });
};
D['smoothie_juice.acai'] = (ic) => {
  drawGlass(ic, SV(V.V5), {
    layers: [{ color: C.acai, to: 0.7 }],
    straw: {},
    inLiquid: (ic, v, { y, half }) => {
      // three topping dots on the surface
      [
        [-0.55, -0.05],
        [-0.05, 0.3],
        [0.1, -0.4],
      ].forEach(([u, dy]) => ic.circle(v.cx + u * half, y + dy, 0.62, ic.solid(C.bananaSlice, ic.dw * 0.6)));
    },
  });
};
D['smoothie_juice.lemonade'] = (ic) => {
  drawGlass(ic, SV(V.V5), {
    layers: [{ color: C.lemonade, to: 0.85 }],
    inLiquid: (ic, v, { y }) => {
      ice(ic, v.cx - 0.7, y + 0.1, 8);
      ice(ic, v.cx + 0.9, y + 3.2, 14);
    },
    overRim: (ic, v) => rimWheel(ic, v, LEMON),
  });
};
D['smoothie_juice.watermelon'] = (ic) => {
  drawGlass(ic, SV(V.V4), {
    layers: [{ color: C.watermelon, to: 0.82 }],
    overRim: (ic, v) => {
      // wedge: point down into the glass, rind on the top arc, three seeds
      const x = v.cx + v.rx - 0.3;
      const y = v.yr - 2.4;
      const r = 3.0;
      const g = [];
      const wedge = (rr) =>
        ic.d([
          ['M', x, y + rr],
          ['L', x - rr * 0.82, y - rr * 0.1],
          ['A', rr * 0.95, rr * 0.95, 0, 0, 1, x + rr * 0.82, y - rr * 0.1],
          ['Z'],
        ]);
      g.push(`<path d="${wedge(r)}"${attrStr(ic.solid(C.melonRind))}/>`);
      g.push(`<path d="${ic.d([['M', x, y + r * 0.86], ['L', x - r * 0.66, y], ['A', r * 0.78, r * 0.78, 0, 0, 1, x + r * 0.66, y], ['Z']])}" fill="${C.pith}"/>`);
      g.push(`<path d="${ic.d([['M', x, y + r * 0.8], ['L', x - r * 0.58, y + 0.15], ['A', r * 0.68, r * 0.68, 0, 0, 1, x + r * 0.58, y + 0.15], ['Z']])}" fill="${C.watermelon}"/>`);
      [
        [-0.75, 0.15],
        [0.75, 0.15],
        [0, 0.95],
      ].forEach(([dx, dy]) => g.push(`<ellipse cx="${ic.n(x + dx)}" cy="${ic.n(y + dy)}" rx="${ic.n(0.24)}" ry="${ic.n(0.4)}" fill="${C.bean}"/>`));
      ic.add(`<g transform="rotate(22 ${ic.n(x)} ${ic.n(y + r)})">${g.join('')}</g>`);
    },
  });
};
D['smoothie_juice.carrot_ginger'] = (ic) => drawBottle(ic);

// --- Water -----------------------------------------------------------------------------------
const WV = (o = {}) => V.V4({ ink: C.inkWater, cx: 12, ...o });

D['water.still'] = (ic) => {
  drawGlass(ic, WV(), {
    layers: [{ color: C.water, to: 0.75 }],
    frontMarks: (ic, v, { y, half }) => {
      // the single water line: the front half of the surface
      ic.path([['M', v.cx + half, y], ['A', half, R * half, 0, 0, 1, v.cx - half, y]], ic.line(C.bubble, ic.dw, { 'stroke-opacity': '0.6' }));
    },
  });
};
D['water.sparkling'] = (ic) => {
  drawGlass(ic, WV(), {
    layers: [{ color: C.water, to: 0.75 }],
    frontMarks: (ic, v, { y, half }) => {
      ic.path([['M', v.cx + half, y], ['A', half, R * half, 0, 0, 1, v.cx - half, y]], ic.line(C.bubble, ic.dw, { 'stroke-opacity': '0.6' }));
      const b = v.ywb - GLASS_FLOOR;
      bubbles(ic, [
        [v.cx - 1.2, b - 1.3, 0.8],
        [v.cx + 0.8, b - 3.1, 0.62],
        [v.cx - 0.3, b - 4.7, 0.46],
      ]);
    },
  });
};

// ---------------------------------------------------------------------------------------------
export const DRINK_IDS = Object.keys(D);

export function render(id, size) {
  const ic = new Icon(size);
  D[id](ic);
  return ic.svg(`${id} ${size === 'L' ? '64' : '24'} grid. Drawn by _source/draw-icons.mjs (DESIGN.md 3.4).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  for (const id of DRINK_IDS) {
    writeFileSync(join(OUT, `${id}.24.svg`), render(id, 'S'));
    writeFileSync(join(OUT, `${id}.64.svg`), render(id, 'L'));
  }
  console.log(`wrote ${DRINK_IDS.length * 2} icons to ${OUT}`);
}
