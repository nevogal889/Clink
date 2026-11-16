// Drawing helpers for the hero generator (draw-heroes.mjs). Plain string building, no deps.
// Every rim, surface, base and cast shadow is an ellipse at ratio 0.30 (DESIGN.md 3.1).

export const RATIO = 0.3;

/** Palette and derived tones used by the heroes (DESIGN.md 3.2; shade = L* minus 12). */
export const C = {
  steel: '#17202A',
  white: '#FFFFFF',
  // bodies
  enamel: '#F4F6F7',
  enamelShade: '#D2D4D5',
  glass: '#DCEEF3',
  glaze: '#2E3A2C',
  glazeShade: '#152013',
  drip: '#4C5E45',
  dripShade: '#31422A',
  clay: '#CDBFA6',
  clayShade: '#AC9F86',
  spoon: '#8E9AA6',
  spoonShade: '#6F7B86',
  bamboo: '#C9A86A',
  bambooShade: '#A7884C',
  tag: '#F5EDCF',
  tagShade: '#D3CBAE',
  // coffee
  crema: '#B77A45',
  cremaShade: '#955C29',
  milkCoffee: '#B88A64',
  foam: '#F2EFEA',
  bean: '#4A2A1C',
  beanShade: '#2E1100',
  // matcha
  matcha: '#7BA23F',
  matchaShade: '#5B8220',
  froth: '#8CB24A',
  frothShade: '#6C922B',
  frothBubble: '#A9C96A',
  // tea
  blackTea: '#B8641E',
  blackTeaShade: '#944700',
  leaf: '#6E7F3A',
  leafShade: '#50611D',
  // smoothie and juice
  berry: '#B8325E',
  berryShade: '#950042',
  berrySeed: '#7E1F43',
  orange: '#F2992E',
  orangeShade: '#CD7A00',
  mango: '#F2B33D',
  pith: '#FBE3B5',
  pithShade: '#D8C195',
  raspberry: '#C2345F',
  raspberryShade: '#9E0043',
  // water
  water: '#CFE8F1',
  waterShade: '#AEC6CF',
  bubble: '#0B7391',
  // category inks (light mode; matcha rim on the dark glaze uses the dark-mode ink)
  inkCoffee: '#4B3527',
  inkMatchaDark: '#B7D69A',
  inkTea: '#6B5306',
  inkSmoothie: '#9E2460',
  inkWater: '#085C74',
};

export const n = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

const attrs = (a = {}) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : v}"`)
    .join('');

export const path = (d, a) => `<path d="${d}"${attrs(a)}/>`;
export const circle = (cx, cy, r, a) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${attrs(a)}/>`;
/** An ellipse at ratio 0.30 (rims, surfaces, bases, shadows). */
export const ell = (cx, cy, rx, a) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(rx * RATIO)}"${attrs(a)}/>`;
export const g = (a, children) => `<g${attrs(a)}>${children.flat().join('')}</g>`;

/** Point on a 0.30 ellipse at angle t (0 = right, pi/2 = front). */
export const onEll = (cx, cy, rx, t) => [cx + rx * Math.cos(t), cy + rx * RATIO * Math.sin(t)];

/** Elliptical arc command from the current point to (x, y) on a 0.30 ellipse of radius rx. */
export const arc = (rx, x, y, large = 0, sweep = 0) =>
  `A${n(rx)} ${n(rx * RATIO)} 0 ${large} ${sweep} ${n(x)} ${n(y)}`;

/** Front half of an ellipse, left to right. */
export const frontArc = (cx, rx, y) => arc(rx, cx + rx, y, 0, 0);
/** Back half of an ellipse, right to left (or left to right with sweep 1). */
export const backArcLR = (cx, rx, y) => arc(rx, cx + rx, y, 0, 1);

/** Polyline through points with smooth Catmull-Rom curves. */
export function smooth(points, closed = false) {
  const p = points;
  if (p.length < 3) return `M${p.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}${closed ? 'Z' : ''}`;
  const at = (i) =>
    closed ? p[(i + p.length) % p.length] : p[Math.max(0, Math.min(p.length - 1, i))];
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  const last = closed ? p.length : p.length - 1;
  for (let i = 0; i < last; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/**
 * Steel contour, drawn under an object's fills. The silhouette is drawn twice: once with a 16 px
 * stroke (8 px shows outside the fill) and once nudged 4 right and 5 down, so the line swells to
 * about 14 px on the shade side (bottom right) and stays 8 px where the light hits (top left).
 */
export function contour(id, shapes, { nudge = [4, 5] } = {}) {
  const inner = shapes.flat().join('');
  return `<g id="${id}" fill="${C.steel}" stroke="${C.steel}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round">${inner}<g transform="translate(${nudge[0]} ${nudge[1]})">${inner}</g></g>`;
}

/**
 * Contour for glass, which can't use an underlay (it would show through the 50% glass): an 8 px
 * stroke on a path offset 4 px outward, plus a second 8 px stroke on the shade side (right wall
 * and base, offset 7 px) for the same swell as opaque objects.
 */
export function glassContour(id, { outline, heavy, rim }) {
  const parts = [path(outline)];
  if (heavy) parts.push(path(heavy));
  if (rim) parts.push(rim);
  return `<g id="${id}" fill="none" stroke="${C.steel}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">${parts.join('')}</g>`;
}

/** The one gleam: a tapered white sliver through the given centre-line points. */
export function gleam(points, width, opacity = '0.85') {
  const N = points.length - 1;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i += 1) {
    const [x, y] = points[i];
    const [ax, ay] = points[Math.max(0, i - 1)];
    const [bx, by] = points[Math.min(N, i + 1)];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // Fuller toward the top, sharp at the bottom: it reads as a highlight, not a stripe.
    const t = i / N;
    const w = (width / 2) * Math.sin(Math.PI * t) ** 0.55 * (1 - 0.35 * t);
    left.push([x + nx * w, y + ny * w]);
    right.push([x - nx * w, y - ny * w]);
  }
  const pts = [...left, ...right.reverse()];
  return path(smooth(pts, true), { fill: C.white, 'fill-opacity': opacity });
}

/** Seeded random numbers, so the speckle is the same on every run. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Graniteware speckle (DESIGN.md 3.2): dots 4 to 9 px across, steel at 35%, about 1.5% of the
 * area. Dots gather in a few loose clusters, the way the glaze spatters, instead of an even grid.
 */
export function speckle({
  seed,
  box,
  inside,
  coverage = 0.015,
  clusters = 4,
  avoid = () => false,
}) {
  const rand = rng(seed);
  const [x0, y0, x1, y1] = box;
  let area = 0;
  for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) if (inside(x, y)) area += 16;
  const centres = [];
  while (clusters > 0 && centres.length < clusters) {
    const p = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
    if (inside(...p)) centres.push(p);
  }
  const dots = [];
  let covered = 0;
  let guard = 0;
  while (covered < area * coverage && guard < 20000) {
    guard += 1;
    let p;
    if (centres.length && rand() < 0.45) {
      const c = centres[Math.floor(rand() * centres.length)];
      const r = 18 + rand() * 46;
      const a = rand() * Math.PI * 2;
      p = [c[0] + Math.cos(a) * r * rand(), c[1] + Math.sin(a) * r * rand()];
    } else {
      p = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
    }
    const r = 2 + rand() * rand() * 2.5;
    if (!inside(p[0], p[1]) || avoid(p[0], p[1])) continue;
    if (dots.some(([x, y, rr]) => Math.hypot(x - p[0], y - p[1]) < rr + r + 14)) continue;
    dots.push([p[0], p[1], r]);
    covered += Math.PI * r * r;
  }
  return g(
    { fill: C.steel, 'fill-opacity': '0.35' },
    dots.map(([x, y, r]) => circle(x, y, r)),
  );
}

/** Point-in-polygon test for speckle regions. */
export function inPoly(poly) {
  return (x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

/** Sample a cubic Bezier. */
export function bezier(p0, p1, p2, p3, steps = 12) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/**
 * An enamel chip: steel showing through where the enamel flaked off, ringed by the pale ground
 * coat. Drawn over the rim line at angle t of the given ellipse.
 */
export function chip(cx, cy, rx, t, size = 1) {
  const [x, y] = onEll(cx, cy, rx, t);
  // A flake, not a hole: jagged, wider than tall, the pale ground coat showing mostly above.
  const outer = [
    [-17, -3],
    [-11, -8],
    [-4, -6],
    [3, -10],
    [12, -7],
    [18, -1],
    [11, 4],
    [4, 7],
    [-5, 5],
    [-12, 6],
  ].map(([a, b]) => [x + a * size, y + b * size]);
  // The steel sits off centre, low and right, so it reads as a flake broken off the edge rather
  // than a ring around a hole.
  const inner = [
    [-8, 0],
    [-3, -3],
    [3, -2],
    [8, -5],
    [15, -1],
    [10, 4],
    [3, 7],
    [-4, 5],
  ].map(([a, b]) => [x + a * size, y + b * size]);
  const poly = (p) => `M${p.map(([a, b]) => `${n(a)} ${n(b)}`).join('L')}Z`;
  return [path(poly(outer), { fill: C.enamelShade }), path(poly(inner), { fill: C.steel })];
}

/** A cast shadow (DESIGN.md 3.2): 0.30 ellipse, steel at 14%. */
export const shadow = (cx, cy, rx) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(rx * RATIO)}" fill="${C.steel}" fill-opacity="0.14"/>`;

/** Wrap a hero. */
export function hero(comment, parts) {
  const body = parts
    .flat()
    .filter(Boolean)
    .map((p) => (p.startsWith('<!--') ? `  ${p}` : `  ${p}`))
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n  <!-- ${comment} -->\n${body}\n</svg>\n`;
}

export const note = (text) => `<!-- ${text} -->`;
