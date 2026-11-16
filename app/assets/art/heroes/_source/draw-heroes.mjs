// Hero generator: draws the five category heroes of DESIGN.md 3.3 and writes them next to this
// folder as {category}.svg. Second art pass (docs/build-notes/art-pass-2.md): same shape grammar,
// more character from the enamelware idea (DESIGN.md 1.1).
//
// Run: node app/assets/art/heroes/_source/draw-heroes.mjs [category ...]
//
// What every hero shares (DESIGN.md 3.1 to 3.3): 1024 artboard, light from the top left, ellipses
// at 0.30, ground line y 880, one shade tone and one gleam per surface, 14 px rim line in category
// ink, flat 14% steel cast shadow. What this pass adds:
//   - the steel contour swells from 8 px (lit side) to about 14 px (shade side), see lib contour()
//   - enamel pieces get a category-ink edge band and sparse clustered speckle; one chip each on the
//     coffee saucer and the water jug, where the steel shows through
//   - each prop is a specific object (a crema tulip, a scoop with powder, a serrated tea leaf, cut
//     citrus with real segments, bevelled ice) instead of a generic shape

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  C,
  RATIO,
  arc,
  bezier,
  chip,
  circle,
  contour,
  ell,
  g,
  glassContour,
  gleam,
  hero,
  inPoly,
  n,
  note,
  onEll,
  path,
  rng,
  shadow,
  smooth,
  speckle,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..');

/** Sample a 0.30 ellipse arc from angle a to b. */
const ellPts = (cx, cy, rx, a, b, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, i) => onEll(cx, cy, rx, a + ((b - a) * i) / steps));

/** Crescent A minus B in top view (circles on the v axis), sampled. */
function crescent(a, rA, b, rB, steps = 28) {
  const v = (rA * rA - rB * rB - a * a + b * b) / (2 * (b - a));
  const u = Math.sqrt(Math.max(0, rA * rA - (v - a) * (v - a)));
  const tA0 = Math.atan2(v - a, -u);
  const tA1 = Math.atan2(v - a, u);
  const tB0 = Math.atan2(v - b, u);
  const tB1 = Math.atan2(v - b, -u);
  const out = [];
  // Along A from left, through the front (positive v), to right.
  let s = tA0;
  let e = tA1;
  if (e > s) e -= Math.PI * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = s + ((e - s) * i) / steps;
    out.push([rA * Math.cos(t), a + rA * Math.sin(t)]);
  }
  // Back along B from right to left through its front.
  s = tB0;
  e = tB1;
  if (e < s) e += Math.PI * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = s + ((e - s) * i) / steps;
    out.push([rB * Math.cos(t), b + rB * Math.sin(t)]);
  }
  return out;
}

/** Top view (u, v) onto a liquid surface centred at (cx, cy), rotated by deg in the plane. */
const project = (cx, cy, deg, du = 0) => {
  const r = (deg * Math.PI) / 180;
  return ([u0, v0]) => {
    const u = u0 + du;
    return [
      cx + u * Math.cos(r) - v0 * Math.sin(r),
      cy + RATIO * (u * Math.sin(r) + v0 * Math.cos(r)),
    ];
  };
};

// =============================================================================================
// Coffee: enamel cup on an enamel saucer, crema with a poured tulip, spoon, three beans.

function coffee() {
  const cx = 590;
  // Saucer: top surface, underside, well. Coffee-ink edge band like enamel plates have.
  const sTop = { cy: 776, rx: 300 };
  const sUnder = { cy: 806, rx: 250 };
  // Cup: rim, bowl, foot.
  const rim = { cy: 514, rx: 206 };
  const ry = rim.rx * RATIO;
  const L = cx - rim.rx;
  const R = cx + rim.rx;
  const foot = { cy: 780, rx: 62 };
  const body =
    `M${L} ${rim.cy}C${L} 640 452 724 540 748L${cx - foot.rx} ${foot.cy}` +
    arc(foot.rx, cx + foot.rx, foot.cy, 0, 0) +
    `L640 748C728 724 ${R} 640 ${R} ${rim.cy}`;
  const bodyFront = `${body}${arc(rim.rx, L, rim.cy, 0, 1)}Z`;
  const bodyFull = `${body}${arc(rim.rx, L, rim.cy, 0, 0)}Z`;
  const handleOuter = 'M782 554H872C926 554 934 638 890 680C856 710 804 718 726 712L768 600Z';
  const handleHole =
    'M798 588H864C892 588 896 634 870 658C850 676 814 682 762 682C780 652 792 622 798 588Z';
  const handle = `${handleOuter}${handleHole}`;

  // Spoon on the saucer, bowl toward the viewer, handle tip just past the saucer's right edge.
  const spoonHandle = smooth([
    [748, 826],
    [800, 806],
    [858, 784],
    [904, 768],
  ]);
  const bowlC = [712, 842];
  const bowl = (() => {
    const pts = [];
    const rot = (-20 * Math.PI) / 180;
    for (let i = 0; i < 36; i += 1) {
      const t = (i / 36) * Math.PI * 2;
      // An egg, wider toward the tip (left), the way a teaspoon bowl is.
      const x = 40 * Math.cos(t) * (1 + 0.12 * Math.cos(t));
      const y = 24 * Math.sin(t);
      pts.push([
        bowlC[0] + x * Math.cos(rot) - y * Math.sin(rot),
        bowlC[1] + x * Math.sin(rot) + y * Math.cos(rot),
      ]);
    }
    return smooth(pts, true);
  })();

  // Beans: two crease up, one turned over (smooth back).
  const bean = (x, y, deg, s = 1) => {
    const r = (deg * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i < 32; i += 1) {
      const t = (i / 32) * Math.PI * 2;
      // Slightly flat on one side: a bean, not an egg.
      const bx = 46 * s * Math.cos(t);
      const by = 29 * s * Math.sin(t) * (Math.sin(t) > 0 ? 0.92 : 1.04);
      pts.push([x + bx * Math.cos(r) - by * Math.sin(r), y + bx * Math.sin(r) + by * Math.cos(r)]);
    }
    return { d: smooth(pts, true), r, x, y, s };
  };
  const beans = [bean(262, 818, -4, 0.86), bean(214, 858, -26), bean(312, 872, 12, 0.94)];
  const crease = ({ x, y, r, s }) => {
    const pts = [
      [-36, 6],
      [-14, -6],
      [8, 7],
      [34, -4],
    ].map(([a, b]) => [
      x + a * s * Math.cos(r) - b * s * Math.sin(r),
      y + a * s * Math.sin(r) + b * s * Math.cos(r),
    ]);
    return path(smooth(pts), {
      fill: 'none',
      stroke: C.beanShade,
      'stroke-width': 7,
      'stroke-linecap': 'round',
    });
  };

  // Crema with a three-layer tulip. It lies across the cup with its bud toward the handle, the
  // way it lands when poured from the drinker's side, so its layers are seen side on and keep
  // their shape at 0.30 instead of flattening into slivers. A little off centre and turned.
  const surf = { cy: rim.cy + 10, rx: 190 };
  const pr = project(cx, surf.cy, 80, -4);
  const scale = ([u, v]) => [u * 0.76, v * 0.76 + 8];
  const tulip = [
    crescent(64, 104, 34, 84),
    crescent(-22, 84, -48, 64),
    crescent(-96, 54, -150, 26),
  ].map((pts) => path(smooth(pts.map(scale).map(pr), true), { fill: C.foam }));
  const pull = path(
    smooth(
      [
        [-2, -142],
        [0, -60],
        [2, 60],
        [0, 166],
      ]
        .map(scale)
        .map(pr),
    ),
    { fill: 'none', stroke: C.foam, 'stroke-width': 7, 'stroke-linecap': 'round' },
  );

  // Speckle regions.
  const bodyPoly = [
    ...bezier([L, rim.cy], [L, 640], [452, 724], [540, 748]),
    ...bezier([640, 748], [728, 724], [R, 640], [R, rim.cy]),
    ...ellPts(cx, rim.cy, rim.rx, 0, Math.PI),
  ];
  const insideBody = inPoly(bodyPoly);
  const cupSpeckle = speckle({
    seed: 11,
    box: [L, rim.cy, R, 760],
    inside: (x, y) =>
      insideBody(x, y) &&
      y > rim.cy + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rim.rx) ** 2)) + 10,
    avoid: (x, y) => x > 430 && x < 530 && y > 560 && y < 740,
    clusters: 0,
    coverage: 0.009,
  });
  const inSaucer = (x, y) => ((x - cx) / 290) ** 2 + ((y - sTop.cy) / 87) ** 2 < 1;
  const saucerSpeckle = speckle({
    seed: 23,
    box: [300, 690, 880, 862],
    inside: (x, y) =>
      inSaucer(x, y) &&
      !(((x - cx) / 176) ** 2 + ((y - 772) / 52.8) ** 2 < 1) &&
      !(x > 660 && x < 910 && y > 760 && y < 870),
    coverage: 0.008,
    clusters: 0,
  });

  return hero(
    'Coffee hero (DESIGN.md 3.3, art pass 2). Enamel cup with one chip in its rim, on an enamel saucer with a coffee-ink edge band, crema with a poured three-layer tulip, a teaspoon, three beans. Ellipses at 0.30, light from the top left, ground line y 880.',
    [
      note('Cast shadows'),
      shadow(626, 818, 292),
      shadow(214, 884, 56),
      shadow(318, 898, 50),
      note('Contour: cup and saucer silhouette, swelling to the shade side'),
      contour('contour', [
        ell(cx, sUnder.cy, sUnder.rx),
        ell(cx, sTop.cy, sTop.rx),
        path(handle, { 'fill-rule': 'evenodd' }),
        path(bodyFull),
      ]),
      note('Saucer: underside, shade, top, well, cup shadow, speckle, edge band, chip'),
      ell(cx, sUnder.cy, sUnder.rx, { fill: C.enamel }),
      path(
        `M736 ${n(sUnder.cy + 75 * Math.sqrt(1 - (146 / 250) ** 2))}${arc(sUnder.rx, cx + sUnder.rx, sUnder.cy, 0, 0)}L890 776H736Z`,
        {
          fill: C.enamelShade,
        },
      ),
      ell(cx, sTop.cy, sTop.rx, { fill: C.enamel }),
      ell(cx, 772, 176, { fill: 'none', stroke: C.enamelShade, 'stroke-width': 6 }),
      ell(654, 792, 112, { fill: C.steel, 'fill-opacity': '0.14' }),
      saucerSpeckle,
      ell(cx, sTop.cy, sTop.rx - 5, { fill: 'none', stroke: C.inkCoffee, 'stroke-width': 10 }),
      note('Teaspoon'),
      contour(
        'contour-spoon',
        [path(spoonHandle, { fill: 'none', 'stroke-width': 30 }), path(bowl)],
        { nudge: [3, 4] },
      ),
      path(spoonHandle, {
        fill: 'none',
        stroke: C.spoon,
        'stroke-width': 14,
        'stroke-linecap': 'round',
      }),
      path(bowl, { fill: C.spoon }),
      path(
        smooth([
          [690, 836],
          [708, 822],
          [732, 818],
        ]),
        {
          fill: 'none',
          stroke: C.white,
          'stroke-opacity': '0.85',
          'stroke-width': 7,
          'stroke-linecap': 'round',
        },
      ),
      path(`M676 852C694 868 726 868 748 846C740 860 712 872 688 864Z`, { fill: C.spoonShade }),
      note('Handle'),
      path(handle, { fill: C.enamel, 'fill-rule': 'evenodd' }),
      path(
        'M884 600C900 632 892 666 866 688C846 704 812 712 770 712L776 698C818 696 852 684 872 662C890 642 894 620 884 600Z',
        {
          fill: C.enamelShade,
        },
      ),
      note('Cup body, shade, speckle, gleam'),
      path(bodyFront, { fill: C.enamel }),
      path(
        `M684 ${n(rim.cy + ry * Math.sqrt(1 - 0.456 ** 2))}${arc(rim.rx, R, rim.cy, 0, 0)}C${R} 640 728 724 640 748L${cx + foot.rx} ${foot.cy}${arc(
          foot.rx,
          622,
          foot.cy + foot.rx * RATIO * Math.sqrt(1 - (32 / 62) ** 2),
          0,
          1,
        )}C664 724 684 650 684 ${n(rim.cy + ry * Math.sqrt(1 - 0.456 ** 2))}Z`,
        { fill: C.enamelShade },
      ),
      cupSpeckle,
      gleam(
        [
          [446, 584],
          [452, 628],
          [468, 672],
          [494, 708],
          [520, 730],
        ],
        34,
      ),
      note('Inside: back wall, crema, tulip'),
      ell(cx, rim.cy, rim.rx, { fill: C.enamelShade }),
      ell(cx, surf.cy, surf.rx, { fill: C.crema }),
      ell(cx, surf.cy, surf.rx - 4, { fill: 'none', stroke: C.cremaShade, 'stroke-width': 8 }),
      ...tulip,
      pull,
      note('Rim line in coffee ink'),
      ell(cx, rim.cy, rim.rx, { fill: 'none', stroke: C.inkCoffee, 'stroke-width': 14 }),
      note('One chip in the enamel rim, front left: the steel shows'),
      chip(cx, rim.cy, rim.rx, Math.PI * 0.7, 0.75),
      note('Beans: the back one turned over'),
      contour(
        'contour-beans',
        beans.map((b) => path(b.d)),
      ),
      ...beans.map((b, i) => g({}, [path(b.d, { fill: C.bean }), i > 0 ? crease(b) : ''])),
      path(
        smooth([
          [236, 806],
          [252, 800],
          [268, 800],
        ]),
        {
          fill: 'none',
          stroke: C.white,
          'stroke-opacity': '0.85',
          'stroke-width': 6,
          'stroke-linecap': 'round',
        },
      ),
    ],
  );
}

// =============================================================================================
// Matcha: chawan in dark glaze over raw clay, whisked froth with bubbles at the back, chasen standing
// at the left, chashaku in front with a small heap of powder on its tip.

/** x on a sampled wall at height y (linear between samples). */
function wallX(pts, y) {
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return pts[pts.length - 1][0];
}

function matcha() {
  const cx = 604;
  const rim = { cy: 548, rx: 252 };
  const L = cx - rim.rx;
  const R = cx + rim.rx;
  const foot = { top: 822, cy: 852, rx: 94 };
  const leftWall = bezier([L, rim.cy], [L, 700], [426, 798], [cx - 96, 818], 40);
  const rightWall = bezier([R, rim.cy], [R, 700], [782, 798], [cx + 96, 818], 40);
  const bowlSide =
    `M${L} ${rim.cy}C${L} 700 426 798 ${cx - 96} 818L${cx - foot.rx} ${foot.top}V${foot.cy}` +
    arc(foot.rx, cx + foot.rx, foot.cy, 0, 0) +
    `V${foot.top}L${cx + 96} 818C782 798 ${R} 700 ${R} ${rim.cy}`;
  const bowlFront = `${bowlSide}${arc(rim.rx, L, rim.cy, 0, 1)}Z`;
  const bowlFull = `${bowlSide}${arc(rim.rx, L, rim.cy, 0, 0)}Z`;

  // Where the glaze stops: a ring round the bowl, so the front half of a 0.30 ellipse, with a
  // soft, slow wave (the glaze runs a little further in two places). Below it is raw clay.
  const gy = 712;
  const gl = wallX(leftWall, gy);
  const gr = wallX(rightWall, gy);
  const grx = (gr - gl) / 2;
  const edge = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const x = gl + (gr - gl) * t;
    const u = (x - cx) / grx;
    const wave = 9 * Math.sin(t * Math.PI * 3 + 0.6) * Math.sin(t * Math.PI);
    edge.push([x, gy + grx * RATIO * Math.sqrt(Math.max(0, 1 - u * u)) + wave]);
  }
  const lowerLeft = leftWall.filter(([, y]) => y > gy);
  const lowerRight = rightWall.filter(([, y]) => y > gy).reverse();
  const clay =
    `M${n(gl)} ${gy}` +
    lowerLeft.map(([x, y]) => `L${n(x)} ${n(y)}`).join('') +
    `L${cx - foot.rx} ${foot.top}V${foot.cy}${arc(foot.rx, cx + foot.rx, foot.cy, 0, 0)}V${foot.top}` +
    lowerRight.map(([x, y]) => `L${n(x)} ${n(y)}`).join('') +
    `L${n(gr)} ${gy}` +
    edge
      .slice()
      .reverse()
      .map(([x, y]) => `L${n(x)} ${n(y)}`)
      .join('') +
    'Z';
  const glazeEdge = path(smooth(edge), {
    fill: 'none',
    stroke: C.glazeShade,
    'stroke-width': 7,
    'stroke-linecap': 'round',
  });
  // Shade: right 28% of the bowl, glaze and clay each take their own shade tone.
  const sx = cx + rim.rx * 0.44;
  const sy = rim.cy + rim.rx * RATIO * Math.sqrt(1 - 0.44 ** 2);
  const shade =
    `M${n(sx)} ${n(sy)}${arc(rim.rx, R, rim.cy, 0, 0)}C${R} 700 782 798 ${cx + 96} 818L${cx + foot.rx} ${foot.top}V${foot.cy}` +
    arc(foot.rx, cx + 46, foot.cy + foot.rx * RATIO * Math.sqrt(1 - (46 / 94) ** 2), 0, 1) +
    `C${cx + 90} 760 ${n(sx)} 660 ${n(sx)} ${n(sy)}Z`;
  // The clay's shade is the part of the clay right of the same boundary the glaze shade uses.
  const footShadeX = cx + 46;
  const footShadeY = foot.cy + foot.rx * RATIO * Math.sqrt(1 - (46 / 94) ** 2);
  const boundary = bezier([sx, sy], [sx, 660], [cx + 90, 760], [footShadeX, footShadeY], 40);
  const edgeY = (x) => {
    const i = edge.findIndex(([ex]) => ex >= x);
    return i <= 0 ? gy : edge[i][1];
  };
  const startIdx = boundary.findIndex(([x, y]) => y >= edgeY(x));
  const [px] = boundary[startIdx];
  const clayShade =
    `M${n(px)} ${n(edgeY(px))}` +
    edge
      .filter(([x]) => x > px)
      .map(([x, y]) => `L${n(x)} ${n(y)}`)
      .join('') +
    rightWall
      .filter(([, y]) => y > gy)
      .map(([x, y]) => `L${n(x)} ${n(y)}`)
      .join('') +
    `L${cx + foot.rx} ${foot.top}V${foot.cy}` +
    arc(foot.rx, footShadeX, footShadeY, 0, 1) +
    boundary
      .slice(startIdx)
      .reverse()
      .map(([x, y]) => `L${n(x)} ${n(y)}`)
      .join('') +
    'Z';

  // Froth: whisked surface. Bubbles gather in a band toward the back edge, the way whisked foam
  // settles.
  const surf = { cy: rim.cy + 12, rx: 234 };
  const pr = project(cx, surf.cy, 0, 0);
  const rand = rng(7);
  const bubbles = [];
  let guard = 0;
  while (bubbles.length < 46 && guard < 2000) {
    guard += 1;
    const a = Math.PI * (1.08 + rand() * 0.84);
    const r = 150 + rand() * 66;
    const [x, y] = pr([r * Math.cos(a), r * Math.sin(a)]);
    const size = rand() < 0.2 ? 6 : 2.5 + rand() * 2;
    if (bubbles.some(([bx, by, bs]) => Math.hypot(bx - x, (by - y) * 2.4) < bs + size + 5)) {
      continue;
    }
    bubbles.push([x, y, size]);
  }

  // Chasen: bamboo handle with a node, a dark binding thread, inner tuft, seven outer tines that
  // flare out and curl back in at the top.
  const wx = 218;
  const handle = `M${wx - 30} 742H${wx + 30}V864${arc(30, wx - 30, 864, 0, 1)}Z`;
  const tines = [];
  for (let i = -3; i <= 3; i += 1) {
    const base = [wx + i * 7, 744];
    const top = 486 + Math.abs(i) * 10;
    const w = i * 20;
    const d =
      `M${n(base[0])} ${base[1]}C${n(wx + i * 9)} 700 ${n(wx + w * 1.06)} 610 ${n(wx + w)} 548` +
      `Q${n(wx + w * 0.92)} ${top} ${n(wx + w * 0.42)} ${top + 14}`;
    tines.push({ d, i });
  }
  const chasenOuter = smooth([
    [wx - 30, 748],
    [wx - 58, 690],
    [wx - 72, 600],
    [wx - 68, 530],
    [wx - 44, 510],
    [wx, 482],
    [wx + 44, 510],
    [wx + 68, 530],
    [wx + 72, 600],
    [wx + 58, 690],
    [wx + 30, 748],
  ]);

  // Chashaku: a bamboo strip with a node, lying in front, tip curled up at the left with a heap
  // of powder on it.
  const scoop = smooth(
    [
      [300, 892],
      [292, 880],
      [318, 878],
      [420, 876],
      [560, 868],
      [566, 878],
      [420, 890],
      [320, 898],
    ],
    true,
  );
  const heap = `M296 882C302 856 336 852 350 878C336 886 312 888 296 882Z`;

  return hero(
    'Matcha hero (DESIGN.md 3.3, art pass 2). Chawan in dark glaze that stops above the raw clay foot, whisked froth with bubbles at the back, chasen standing at the left, chashaku in front with a heap of powder. Ellipses at 0.30, light from the top left, ground line y 880.',
    [
      note('Cast shadows'),
      shadow(654, 852, 168),
      shadow(242, 872, 52),
      shadow(446, 900, 132),
      note('Chasen'),
      contour('contour-chasen', [path(chasenOuter), path(handle)]),
      path(chasenOuter, { fill: C.bambooShade }),
      path(
        `M${wx - 14} 744C${wx - 22} 660 ${wx - 26} 580 ${wx} 540C${wx + 26} 580 ${wx + 22} 660 ${wx + 14} 744Z`,
        {
          fill: C.bambooShade,
        },
      ),
      g(
        { fill: 'none', stroke: C.bamboo, 'stroke-width': 10, 'stroke-linecap': 'round' },
        tines.map(({ d }) => path(d)),
      ),
      path(handle, { fill: C.bamboo }),
      path(
        `M${wx + 12} 742H${wx + 30}V864${arc(30, wx + 12, 864 + 30 * RATIO * Math.sqrt(1 - 0.36), 0, 1)}Z`,
        {
          fill: C.bambooShade,
        },
      ),
      path(`M${wx - 30} 752H${wx + 30}`, { fill: 'none', stroke: C.steel, 'stroke-width': 9 }),
      path(`M${wx - 30} 812H${wx + 30}`, {
        fill: 'none',
        stroke: C.bambooShade,
        'stroke-width': 6,
      }),
      gleam(
        [
          [wx - 18, 772],
          [wx - 19, 800],
          [wx - 19, 830],
          [wx - 18, 852],
        ],
        9,
      ),
      note('Chawan contour'),
      contour('contour', [path(bowlFull)]),
      note('Inside: back wall, froth, bubbles'),
      ell(cx, rim.cy, rim.rx, { fill: C.glazeShade }),
      ell(cx, surf.cy, surf.rx, { fill: C.froth }),
      g(
        { fill: C.frothBubble },
        bubbles.map(([x, y, r]) => ell(x, y, r * 1.6)),
      ),
      note('Body: glaze, raw clay below the glaze line, shade, gleam'),
      path(bowlFront, { fill: C.glaze }),
      path(clay, { fill: C.clay }),
      path(shade, { fill: C.glazeShade }),
      path(clayShade, { fill: C.clayShade }),
      path(`M${cx - foot.rx} ${foot.top}${arc(foot.rx, cx + foot.rx, foot.top, 0, 0)}`, {
        fill: 'none',
        stroke: C.clayShade,
        'stroke-width': 6,
      }),
      glazeEdge,
      gleam(
        [
          [424, 600],
          [432, 640],
          [448, 676],
          [470, 704],
        ],
        36,
      ),
      note('Rim line: dark-mode matcha ink, so it shows on the dark glaze'),
      ell(cx, rim.cy, rim.rx, { fill: 'none', stroke: C.inkMatchaDark, 'stroke-width': 14 }),
      note('Chashaku with a heap of matcha'),
      contour('contour-scoop', [path(scoop), path(heap)], { nudge: [3, 4] }),
      path(scoop, { fill: C.bamboo }),
      path('M420 876L560 868L566 878L420 890Z', { fill: C.bambooShade }),
      path('M452 874V890', { fill: 'none', stroke: C.bambooShade, 'stroke-width': 7 }),
      path(heap, { fill: C.matcha }),
      path('M330 862C344 864 352 872 350 878C340 884 330 885 322 885C330 878 332 870 330 862Z', {
        fill: C.matchaShade,
      }),
    ],
  );
}

// =============================================================================================
// Tea: glass cup of black tea with a tag over the rim, an enamel teapot with a bail handle behind
// it, one serrated tea leaf in front.

/** A leaf with a serrated edge, midrib and two pairs of veins. */
function leaf(cx, cy, len, wid, deg, seed) {
  const r = (deg * Math.PI) / 180;
  const rand = rng(seed);
  const to = ([u, v]) => [
    cx + u * Math.cos(r) - v * Math.sin(r),
    cy + u * Math.sin(r) + v * Math.cos(r),
  ];
  const half = len / 2;
  const upper = [];
  const lower = [];
  const steps = 14;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = -half + len * t;
    // Widest a third of the way along, pointed tip.
    const w = (wid / 2) * Math.sin(Math.PI * t ** 0.8) * (1 - 0.15 * t);
    const tooth = i > 1 && i < steps - 1 && i % 2 === 1 ? 2.5 + rand() * 1.5 : 0;
    upper.push([u, -(w + tooth)]);
    lower.push([u, w + tooth * 0.8]);
  }
  const outline = [...upper, ...lower.slice(1, -1).reverse()].map(to);
  const d = smooth(outline, true);
  const rib = smooth(
    [
      [-half + 6, 0],
      [0, -2],
      [half - 10, 0],
    ].map(to),
  );
  const veins = [
    [
      [-12, -1],
      [6, -14],
    ],
    [
      [-12, 1],
      [6, 13],
    ],
    [
      [16, -1],
      [32, -10],
    ],
    [
      [16, 1],
      [32, 9],
    ],
  ].map((pts) =>
    path(
      `M${pts
        .map(to)
        .map(([x, y]) => `${n(x)} ${n(y)}`)
        .join('L')}`,
    ),
  );
  // Shade: a band along the lower (shade-side) edge only, so the leaf stays leaf green.
  const band = [...lower, ...lower.map(([u, v]) => [u, v * 0.45]).reverse()].map(to);
  const shadeD = `M${band.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
  return { d, rib, veins, shadeD };
}

function tea() {
  // Glass cup.
  const cx = 622;
  const rim = { cy: 470, rx: 178 };
  const base = { cy: 838, rx: 144 };
  const wallL = (y) => cx - rim.rx + ((rim.rx - base.rx) * (y - rim.cy)) / (base.cy - rim.cy);
  const wallR = (y) => 2 * cx - wallL(y);
  const glass = `M${cx - rim.rx} ${rim.cy}L${cx - base.rx} ${base.cy}${arc(base.rx, cx + base.rx, base.cy, 0, 0)}L${cx + rim.rx} ${rim.cy}${arc(rim.rx, cx - rim.rx, rim.cy, 0, 0)}Z`;
  const glassHandle =
    'M794 530H870C924 530 930 642 892 702C866 744 822 772 770 778L773 744C814 740 848 718 868 684C894 640 892 566 864 566H790Z';
  // Tea at 80%, inside a 4 px glass wall, on a 24 px glass bottom.
  const ty = rim.cy + (base.cy - rim.cy) * 0.2;
  const by = base.cy - 24;
  const t0 = { l: wallL(ty) + 4, r: wallR(ty) - 4 };
  const t1 = { l: wallL(by) + 4, r: wallR(by) - 4 };
  const trx = (t0.r - t0.l) / 2;
  const brx = (t1.r - t1.l) / 2;
  const teaBody = `M${n(t0.l)} ${n(ty)}L${n(t1.l)} ${by}${arc(brx, t1.r, by, 0, 0)}L${n(t0.r)} ${n(ty)}${arc(trx, t0.l, ty, 0, 0)}Z`;
  const sx = cx + trx * 0.46;
  const sy = ty + trx * RATIO * Math.sqrt(1 - 0.46 ** 2);
  const bsx = cx + brx * 0.52;
  const bsy = by + brx * RATIO * Math.sqrt(1 - 0.52 ** 2);
  const teaShade = `M${n(sx)} ${n(sy)}${arc(trx, t0.r, ty, 0, 0)}L${n(t1.r)} ${by}${arc(brx, bsx, bsy, 0, 1)}Z`;

  // Teapot: round enamel body, flat lid with an ink knob, steel bail handle with a bamboo grip,
  // spout toward the cup.
  const px = 258;
  const potBase = { cy: 840, rx: 88 };
  const potBody =
    `M${px - potBase.rx} ${potBase.cy}C${px - 150} 806 ${px - 150} 690 ${px - 100} 652C${px - 72} 630 ${px - 36} 622 ${px} 622` +
    `C${px + 36} 622 ${px + 72} 630 ${px + 100} 652C${px + 150} 690 ${px + 150} 806 ${px + potBase.rx} ${potBase.cy}` +
    `${arc(potBase.rx, px - potBase.rx, potBase.cy, 0, 1)}Z`;
  const lid = { cy: 624, rx: 60 };
  const lidDome = `M${px - lid.rx} ${lid.cy}C${px - 56} 592 ${px - 30} 578 ${px} 578C${px + 30} 578 ${px + 56} 592 ${px + lid.rx} ${lid.cy}${arc(lid.rx, px - lid.rx, lid.cy, 0, 1)}Z`;
  const knob = `M${px - 13} 580V560${arc(13, px + 13, 560, 0, 1)}V580${arc(13, px - 13, 580, 0, 1)}Z`;
  const spout = `M${px + 128} 712C${px + 160} 700 ${px + 172} 676 ${px + 178} 648L${px + 206} 636C${px + 214} 640 ${px + 212} 652 ${px + 206} 658C${px + 200} 720 ${px + 186} 776 ${px + 136} 800Z`;
  const wire = `M${px - 92} 652C${px - 104} 556 ${px - 56} 500 ${px} 500C${px + 56} 500 ${px + 104} 556 ${px + 92} 652`;
  const grip = `M${px - 40} 507Q${px} 494 ${px + 40} 507`;
  const potPoly = [
    ...bezier([px - potBase.rx, potBase.cy], [px - 150, 806], [px - 150, 690], [px - 100, 652]),
    ...bezier([px - 100, 652], [px - 72, 630], [px - 36, 622], [px, 622]),
    ...bezier([px, 622], [px + 36, 622], [px + 72, 630], [px + 100, 652]),
    ...bezier([px + 100, 652], [px + 150, 690], [px + 150, 806], [px + potBase.rx, potBase.cy]),
    ...ellPts(px, potBase.cy, potBase.rx, 0, Math.PI),
  ];
  const potSpeckle = speckle({
    seed: 5,
    box: [px - 140, 640, px + 140, 860],
    inside: inPoly(potPoly),
    avoid: (x, y) => (x < px - 70 && y > 670 && y < 800) || (y < 650 && Math.abs(x - px) < 70),
    coverage: 0.01,
    clusters: 0,
  });
  const potShade = `M${px + 56} 628C${px + 72} 632 ${px + 88} 640 ${px + 100} 652C${px + 150} 690 ${px + 150} 806 ${px + potBase.rx} ${potBase.cy}${arc(
    potBase.rx,
    px + 40,
    potBase.cy + potBase.rx * RATIO * Math.sqrt(1 - (40 / 88) ** 2),
    0,
    1,
  )}C${px + 86} 790 ${px + 98} 700 ${px + 56} 628Z`;

  const lf = leaf(404, 884, 150, 56, -10, 3);

  return hero(
    'Tea hero (DESIGN.md 3.3, art pass 2). V7 glass cup, black tea at 80%, a tag hanging over the right rim on a steel string. Enamel teapot with a bail handle and a tea-ink knob and lid band behind and left, spout toward the cup. One serrated leaf in front.',
    [
      note('Cast shadows'),
      shadow(296, 856, 100),
      shadow(660, 858, 150),
      shadow(420, 902, 58),
      note('Teapot: contour, handle wire, spout, body, shade, speckle, gleam, lid, knob'),
      contour('contour-teapot', [
        path(wire, { fill: 'none', 'stroke-width': 26 }),
        path(spout),
        path(potBody),
        path(lidDome),
        path(knob),
      ]),
      path(wire, { fill: 'none', stroke: C.spoon, 'stroke-width': 9, 'stroke-linecap': 'round' }),
      path(grip, { fill: 'none', stroke: C.bamboo, 'stroke-width': 22, 'stroke-linecap': 'round' }),
      path(`M${px + 10} 497Q${px + 26} 498 ${px + 40} 507`, {
        fill: 'none',
        stroke: C.bambooShade,
        'stroke-width': 10,
        'stroke-linecap': 'round',
      }),
      circle(px - 92, 652, 9, { fill: C.spoon }),
      circle(px + 92, 652, 9, { fill: C.spoonShade }),
      path(spout, { fill: C.enamel }),
      path(
        `M${px + 206} 658C${px + 200} 720 ${px + 186} 776 ${px + 136} 800L${px + 132} 782C${px + 168} 764 ${px + 182} 722 ${px + 192} 664Z`,
        {
          fill: C.enamelShade,
        },
      ),
      path(`M${px + 196} 640L${px + 206} 636C${px + 214} 640 ${px + 212} 652 ${px + 206} 658`, {
        fill: 'none',
        stroke: C.inkTea,
        'stroke-width': 10,
        'stroke-linecap': 'round',
      }),
      path(potBody, { fill: C.enamel }),
      path(potShade, { fill: C.enamelShade }),
      potSpeckle,
      gleam(
        [
          [px - 98, 676],
          [px - 106, 716],
          [px - 104, 760],
          [px - 92, 796],
        ],
        26,
      ),
      path(lidDome, { fill: C.enamel }),
      path(
        `M${px + 30} 582C${px + 48} 590 ${px + 58} 604 ${px + lid.rx} ${lid.cy}${arc(lid.rx, px + 36, lid.cy + lid.rx * RATIO * 0.77, 0, 1)}C${px + 40} 610 ${px + 38} 596 ${px + 30} 582Z`,
        {
          fill: C.enamelShade,
        },
      ),
      path(`M${px - lid.rx} ${lid.cy}${arc(lid.rx, px + lid.rx, lid.cy, 0, 0)}`, {
        fill: 'none',
        stroke: C.inkTea,
        'stroke-width': 14,
      }),
      path(knob, { fill: C.inkTea }),
      ell(px, 560, 13, { fill: C.tagShade }),
      note('Glass cup: contour (offset outward, since glass is see-through), handle, body, tea'),
      glassContour('contour-cup', {
        outline: `M${cx - rim.rx - 4} ${rim.cy}L${cx - base.rx - 4} ${base.cy}${arc(base.rx + 4, cx + base.rx + 4, base.cy, 0, 0)}L${cx + rim.rx + 4} ${rim.cy}`,
        heavy: `M${n(wallR(rim.cy + 70) + 6)} ${rim.cy + 70}L${cx + base.rx + 6} ${base.cy}${arc(base.rx + 6, cx, base.cy + (base.rx + 6) * RATIO, 0, 1)}`,
        rim: ell(cx, rim.cy, rim.rx + 2, { 'stroke-width': 30 }),
      }),
      g(
        {
          id: 'contour-cup-handle',
          fill: 'none',
          stroke: C.steel,
          'stroke-width': 8,
          'stroke-linejoin': 'round',
        },
        [
          path('M797 526H872C926 526 934 642 895 704C868 748 823 777 770 782'),
          path('M786 570H864C888 570 890 640 865 682C846 714 812 734 776 739'),
          path('M902 600C912 640 906 680 892 708C868 750 826 780 772 786', { 'stroke-width': 6 }),
        ],
      ),
      path(glassHandle, { fill: C.glass, 'fill-opacity': '0.5' }),
      path(glass, { fill: C.glass, 'fill-opacity': '0.5' }),
      path(
        `M${n(wallL(by) + 4)} ${by}${arc(brx, t1.r, by, 0, 0)}L${cx + base.rx - 4} ${base.cy - 6}${arc(base.rx - 4, cx - base.rx + 4, base.cy - 6, 0, 1)}Z`,
        {
          fill: C.glass,
          'fill-opacity': '0.5',
        },
      ),
      path(teaBody, { fill: C.blackTea }),
      path(teaShade, { fill: C.blackTeaShade }),
      path(`M${n(t0.l)} ${n(ty)}${arc(trx, t0.r, ty, 0, 0)}`, {
        fill: 'none',
        stroke: C.blackTeaShade,
        'stroke-width': 5,
      }),
      gleam(
        [
          [496, 584],
          [502, 640],
          [508, 700],
          [514, 760],
        ],
        30,
      ),
      ell(cx, rim.cy, rim.rx, { fill: 'none', stroke: C.inkTea, 'stroke-width': 14 }),
      note('Tag on a steel string over the right rim: paper with a folded ink top'),
      path(
        smooth([
          [690, 548],
          [716, 500],
          [742, 470],
          [756, 486],
          [760, 540],
          [758, 604],
        ]),
        { fill: 'none', stroke: C.spoonShade, 'stroke-width': 4, 'stroke-linecap': 'round' },
      ),
      g({ transform: 'rotate(-4 758 604)' }, [
        path('M730 604H786V676H730Z', {
          id: 'contour-tag',
          fill: C.steel,
          stroke: C.steel,
          'stroke-width': 14,
          'stroke-linejoin': 'round',
        }),
        path('M730 604H786V676H730Z', { fill: C.tag }),
        path('M770 604H786V676H770Z', { fill: C.tagShade }),
        path('M730 604H786V620H730Z', { fill: C.inkTea }),
      ]),
      note('One serrated tea leaf in front'),
      contour('contour-leaf', [path(lf.d)], { nudge: [2, 3] }),
      path(lf.d, { fill: C.leaf }),
      path(lf.shadeD, { fill: C.leafShade }),
      path(lf.rib, {
        fill: 'none',
        stroke: C.leafShade,
        'stroke-width': 5,
        'stroke-linecap': 'round',
      }),
      g(
        { fill: 'none', stroke: C.leafShade, 'stroke-width': 3.5, 'stroke-linecap': 'round' },
        lf.veins,
      ),
    ],
  );
}

// =============================================================================================
// Shared by the two tall-glass heroes: a tapered glass with a thick bottom.

function taperedGlass(cx, rim, base) {
  const wallL = (y) => cx - rim.rx + ((rim.rx - base.rx) * (y - rim.cy)) / (base.cy - rim.cy);
  const wallR = (y) => 2 * cx - wallL(y);
  const body = `M${cx - rim.rx} ${rim.cy}L${cx - base.rx} ${base.cy}${arc(base.rx, cx + base.rx, base.cy, 0, 0)}L${cx + rim.rx} ${rim.cy}${arc(rim.rx, cx - rim.rx, rim.cy, 0, 0)}Z`;
  const contourParts = {
    outline: `M${cx - rim.rx - 4} ${rim.cy}L${cx - base.rx - 4} ${base.cy}${arc(base.rx + 4, cx + base.rx + 4, base.cy, 0, 0)}L${cx + rim.rx + 4} ${rim.cy}`,
    heavy: `M${n(wallR(rim.cy + 70) + 6)} ${rim.cy + 70}L${cx + base.rx + 6} ${base.cy}${arc(base.rx + 6, cx, base.cy + (base.rx + 6) * RATIO, 0, 1)}`,
    rim: ell(cx, rim.cy, rim.rx + 2, { 'stroke-width': 30 }),
  };
  /** A liquid from level y down to the inside of a glass bottom `bottom` px thick. */
  const liquid = (y, bottom) => {
    const by = base.cy - bottom;
    const t0 = { l: wallL(y) + 4, r: wallR(y) - 4 };
    const t1 = { l: wallL(by) + 4, r: wallR(by) - 4 };
    const trx = (t0.r - t0.l) / 2;
    const brx = (t1.r - t1.l) / 2;
    const d = `M${n(t0.l)} ${n(y)}L${n(t1.l)} ${n(by)}${arc(brx, t1.r, by, 0, 0)}L${n(t0.r)} ${n(y)}${arc(trx, t0.l, y, 0, 0)}Z`;
    const sx = cx + trx * 0.46;
    const sy = y + trx * RATIO * Math.sqrt(1 - 0.46 ** 2);
    const bsx = cx + brx * 0.5;
    const bsy = by + brx * RATIO * Math.sqrt(1 - 0.5 ** 2);
    const shadeD = `M${n(sx)} ${n(sy)}${arc(trx, t0.r, y, 0, 0)}L${n(t1.r)} ${n(by)}${arc(brx, bsx, bsy, 0, 1)}Z`;
    const front = `M${n(t0.l)} ${n(y)}${arc(trx, t0.r, y, 0, 0)}`;
    // The thick glass bottom under the liquid: glass over glass reads denser.
    const foot = `M${n(t1.l)} ${n(by)}${arc(brx, t1.r, by, 0, 0)}L${cx + base.rx - 5} ${base.cy - 6}${arc(base.rx - 5, cx - base.rx + 5, base.cy - 6, 0, 1)}Z`;
    return { d, shadeD, front, foot, trx, y };
  };
  return { body, contourParts, liquid, wallL, wallR };
}

// =============================================================================================
// Smoothie & Juice: tall glass of berry smoothie, plain orange straw, an orange wheel with real
// segments on the rim, half an orange cut face up, two raspberries (one on its side).

function citrusFace(cx, cy, rx, segments, rot = 0) {
  // Cut face seen from above at 0.30: rind, pith, flesh, pith spokes, centre.
  const parts = [
    ell(cx, cy, rx, { fill: C.orange }),
    ell(cx, cy, rx - 7, { fill: C.pith }),
    ell(cx, cy, rx - 14, { fill: C.mango }),
  ];
  const spokes = [];
  for (let i = 0; i < segments; i += 1) {
    const t = rot + (i / segments) * Math.PI * 2;
    const [x, y] = onEll(cx, cy, rx - 14, t);
    spokes.push(`M${n(cx)} ${n(cy)}L${n(x)} ${n(y)}`);
  }
  parts.push(
    path(spokes.join(''), {
      fill: 'none',
      stroke: C.pith,
      'stroke-width': 5,
      'stroke-linecap': 'round',
    }),
  );
  parts.push(ell(cx, cy, 13, { fill: C.pith }));
  return parts;
}

function orangeWheel(cx, cy, r) {
  // A wheel stood on its edge faces the viewer: circles, not ellipses.
  const segs = [];
  const k = 9;
  for (let i = 0; i < k; i += 1) {
    const a0 = (i / k) * Math.PI * 2 + 0.07;
    const a1 = ((i + 1) / k) * Math.PI * 2 - 0.07;
    const r0 = 9;
    const r1 = r - 15;
    const p = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const [x0, y0] = p(r0, (a0 + a1) / 2);
    const [x1, y1] = p(r1, a0 + 0.04);
    const [x2, y2] = p(r1, a1 - 0.04);
    segs.push(`M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}A${n(r1)} ${n(r1)} 0 0 1 ${n(x2)} ${n(y2)}Z`);
  }
  return [
    circle(cx, cy, r, { fill: C.orange }),
    circle(cx, cy, r - 7, { fill: C.pith }),
    path(segs.join(''), {
      fill: C.mango,
      stroke: C.mango,
      'stroke-width': 6,
      'stroke-linejoin': 'round',
    }),
    path(
      `M${n(cx + r * 0.2)} ${n(cy - r * 0.98)}A${r} ${r} 0 0 1 ${n(cx + r * 0.98)} ${n(cy + r * 0.2)}L${n(cx + (r - 7) * 0.98)} ${n(cy + (r - 7) * 0.2)}A${r - 7} ${r - 7} 0 0 0 ${n(cx + (r - 7) * 0.2)} ${n(cy - (r - 7) * 0.98)}Z`,
      {
        fill: C.orangeShade,
      },
    ),
  ];
}

/** A raspberry: drupelets on a cone, wide at the hollow end. Local +v points to the tip. */
function raspberry(cx, cy, deg, hollow) {
  const r = (deg * Math.PI) / 180;
  const to = ([u, v]) => [
    cx + u * Math.cos(r) - v * Math.sin(r),
    cy + u * Math.sin(r) + v * Math.cos(r),
  ];
  // Hex-packed drupelets, rows narrowing from the hollow end to the tip.
  const counts = [3, 4, 3, 2, 1];
  const pitch = 19;
  const drupes = [];
  counts.forEach((count, row) => {
    const v = -32 + row * 16;
    for (let i = 0; i < count; i += 1) drupes.push(to([(i - (count - 1) / 2) * pitch, v]));
  });
  const R = 11.5;
  const lit = drupes.filter(([x]) => x - cx <= 8);
  const dark = drupes.filter(([x]) => x - cx > 8);
  const out = {
    silhouette: drupes.map(([x, y]) => circle(x, y, R)),
    fill: [
      g(
        { fill: C.raspberry, stroke: C.raspberryShade, 'stroke-width': 3 },
        lit.map(([x, y]) => circle(x, y, R)),
      ),
      g(
        { fill: C.raspberryShade },
        dark.map(([x, y]) => circle(x, y, R)),
      ),
    ],
  };
  if (hollow) {
    const [hx, hy] = to([0, -40]);
    out.fill.push(
      ell(hx, hy, 22, { fill: C.raspberryShade }),
      ell(hx, hy + 1, 14, { fill: C.berrySeed }),
    );
  }
  return out;
}

function smoothie() {
  const cx = 600;
  const rim = { cy: 262, rx: 152 };
  const base = { cy: 850, rx: 102 };
  const gl = taperedGlass(cx, rim, base);
  const sm = gl.liquid(rim.cy + (base.cy - rim.cy) * 0.15, 26);
  const rand = rng(41);
  const seeds = [];
  let guard = 0;
  while (seeds.length < 22 && guard < 3000) {
    guard += 1;
    const y = sm.y + 60 + rand() * 430;
    const x = gl.wallL(y) + 26 + rand() * (gl.wallR(y) - gl.wallL(y) - 52) * 0.62;
    if (x < 548 && y > 420 && y < 720) continue; // the gleam
    if (seeds.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 38)) continue;
    seeds.push([x, y, 2.6 + rand() * 1.4]);
  }
  // Straw: enters the right third, leans 12 degrees right.
  const lean = Math.tan((12 * Math.PI) / 180);
  const s0 = [652, sm.y + 8];
  // A bendy straw: the elbow sits above the rim, the short arm points out to the right.
  const elbow = [s0[0] + lean * (s0[1] - 176), 176];
  const tip = [elbow[0] + 64, elbow[1] - 48];
  const tipDeg = (Math.atan2(64, 48) * 180) / Math.PI;
  const along = (y) => [s0[0] + lean * (s0[1] - y), y];
  const strawLine = `M${n(s0[0])} ${n(s0[1])}L${n(elbow[0])} ${elbow[1]}L${n(tip[0])} ${n(tip[1])}`;
  const ribs = [190, 202, 214].map((y) => {
    const [x] = along(y);
    return `M${n(x - 12)} ${n(y - 2.5)}L${n(x + 12)} ${n(y + 2.5)}`;
  });

  const berryA = raspberry(782, 840, 6, true);
  const berryB = raspberry(866, 872, -78, false);

  return hero(
    'Smoothie & Juice hero (DESIGN.md 3.3, art pass 2). V5 tall glass with a thick bottom, berry smoothie at 85% with seeds, plain orange bendy straw leaning 12 degrees, an orange wheel with nine segments on the rim, half an orange cut face up, two raspberries (one on its side).',
    [
      note('Cast shadows'),
      shadow(632, 866, 116),
      shadow(296, 884, 104),
      shadow(842, 892, 70),
      note('Half orange, cut face up: rind dome, then the cut face'),
      contour('contour-orange', [
        path(`M170 818A112 76 0 0 0 394 818${arc(112, 170, 818, 0, 0)}Z`),
      ]),
      path(`M170 818A112 76 0 0 0 394 818Z`, { fill: C.orange }),
      path(`M330 848${arc(112, 394, 818, 0, 0)}A112 76 0 0 1 330 887Z`, { fill: C.orangeShade }),
      gleam(
        [
          [186, 838],
          [200, 858],
          [222, 874],
        ],
        14,
      ),
      ...citrusFace(282, 818, 112, 10, 0.2),
      path('M262 822C266 812 276 812 276 820C272 826 266 826 262 822Z', { fill: C.pithShade }),
      path('M290 814C294 806 304 806 304 814C300 820 294 820 290 814Z', { fill: C.pithShade }),
      note('Tall glass: contour (offset outward, since glass is see-through), body'),
      glassContour('contour-glass', {
        ...gl.contourParts,
        rim: `${gl.contourParts.rim}${path(`M${n(tip[0])} ${n(tip[1])}L${n(elbow[0])} ${elbow[1]}L${n(along(rim.cy)[0])} ${rim.cy}`, { 'stroke-width': 42 })}`,
      }),
      path(gl.body, { fill: C.glass, 'fill-opacity': '0.5' }),
      path(`M${cx - rim.rx} ${rim.cy}${arc(rim.rx, cx + rim.rx, rim.cy, 0, 1)}`, {
        fill: 'none',
        stroke: C.inkSmoothie,
        'stroke-width': 14,
      }),
      note('Straw behind the front glass, above the smoothie'),
      path(strawLine, {
        fill: 'none',
        stroke: C.orange,
        'stroke-width': 26,
        'stroke-linejoin': 'round',
      }),
      path(
        `M${n(s0[0] + 8)} ${n(s0[1] + 2)}L${n(elbow[0] + 8)} ${elbow[1] + 4}L${n(tip[0] + 4)} ${n(tip[1] + 8)}`,
        {
          fill: 'none',
          stroke: C.orangeShade,
          'stroke-width': 8,
          'stroke-linejoin': 'round',
        },
      ),
      path(ribs.join(''), {
        fill: 'none',
        stroke: C.orangeShade,
        'stroke-width': 4,
        'stroke-linecap': 'round',
      }),
      `<ellipse cx="${n(tip[0])}" cy="${n(tip[1])}" rx="13" ry="3.9" fill="${C.orangeShade}" transform="rotate(${n(tipDeg)} ${n(tip[0])} ${n(tip[1])})"/>`,
      note('Berry smoothie, shade, seeds, thick glass bottom'),
      path(sm.d, { fill: C.berry }),
      path(sm.shadeD, { fill: C.berryShade }),
      path(sm.front, { fill: 'none', stroke: C.berryShade, 'stroke-width': 5 }),
      g(
        { fill: C.berrySeed },
        seeds.map(([x, y, r]) => circle(x, y, r)),
      ),
      path(sm.foot, { fill: C.glass, 'fill-opacity': '0.5' }),
      gleam(
        [
          [512, 420],
          [518, 520],
          [526, 620],
          [532, 700],
        ],
        26,
      ),
      path(`M${cx - rim.rx} ${rim.cy}${arc(rim.rx, cx + rim.rx, rim.cy, 0, 0)}`, {
        fill: 'none',
        stroke: C.inkSmoothie,
        'stroke-width': 14,
      }),
      note('Orange wheel sitting on the rim, top right'),
      circle(774, 250, 66, {
        id: 'contour-wheel',
        fill: C.steel,
        stroke: C.steel,
        'stroke-width': 16,
      }),
      circle(778, 255, 66, {
        id: 'contour-wheel-weight',
        fill: C.steel,
        stroke: C.steel,
        'stroke-width': 16,
      }),
      ...orangeWheel(774, 250, 66),
      note('Two raspberries, front right: one standing (hollow up), one on its side'),
      contour('contour-berries', [...berryB.silhouette, ...berryA.silhouette], { nudge: [3, 4] }),
      ...berryB.fill,
      ...berryA.fill,
      circle(760, 820, 4.5, { fill: C.white, 'fill-opacity': '0.85' }),
    ],
  );
}

// =============================================================================================
// Water: heavy-bottomed tumbler, water at 75%, two bevelled ice cubes, three bubbles. Enamel jug
// behind and left with a water-ink rim, a pouring lip and one chip.

function iceCube(cx, cy, size, deg) {
  const r = (deg * Math.PI) / 180;
  const to = ([u, v]) => [
    cx + u * Math.cos(r) - v * Math.sin(r),
    cy + u * Math.sin(r) + v * Math.cos(r),
  ];
  // A cube seen from the front and a little above: front face, top face going back, right face
  // in shade. Rounded corners come from a stroke in the face's own colour.
  const h = size / 2;
  const d = size * 0.3;
  const dx = -d / 2;
  const dy = d * 0.35;
  const q = (pts) =>
    `M${pts
      .map(([u, v]) => to([u + dx, v + dy]))
      .map(([x, y]) => `${n(x)} ${n(y)}`)
      .join('L')}Z`;
  const front = q([
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ]);
  const top = q([
    [-h, -h],
    [h, -h],
    [h + d, -h - d * 0.7],
    [-h + d, -h - d * 0.7],
  ]);
  const side = q([
    [h, -h],
    [h + d, -h - d * 0.7],
    [h + d, h - d * 0.7],
    [h, h],
  ]);
  const soft = (fill) => ({ fill, stroke: fill, 'stroke-width': 8, 'stroke-linejoin': 'round' });
  return [path(front, soft(C.enamel)), path(top, soft(C.white)), path(side, soft(C.enamelShade))];
}

function water() {
  const cx = 628;
  const rim = { cy: 478, rx: 172 };
  const base = { cy: 840, rx: 138 };
  const gl = taperedGlass(cx, rim, base);
  const wt = gl.liquid(rim.cy + (base.cy - rim.cy) * 0.25, 40);
  // Facets on the lower two thirds, like the classic cafe tumbler: a smooth band at the top,
  // then flat vertical faces down to the heavy bottom. Lines run on the front of the glass.
  const fy = rim.cy + (base.cy - rim.cy) * 0.34;
  const fb = base.cy - 4;
  const rAt = (y) => (gl.wallR(y) - gl.wallL(y)) / 2;
  const facets = [];
  for (let i = -5; i <= 5; i += 1) {
    const s = Math.sin((i / 6) * (Math.PI / 2));
    const c = Math.cos((i / 6) * (Math.PI / 2));
    const top = [cx + rAt(fy) * s, fy + rAt(fy) * RATIO * c];
    const bot = [cx + base.rx * 0.96 * s, fb + base.rx * RATIO * c];
    facets.push(`M${n(top[0])} ${n(top[1])}L${n(bot[0])} ${n(bot[1])}`);
  }
  const ridge = `M${n(cx - rAt(fy))} ${n(fy)}${arc(rAt(fy), cx + rAt(fy), fy, 0, 0)}`;

  // Jug: tapered enamel body, rim with a pouring lip at the left, D handle on the right.
  const jx = 290;
  const jr = { cy: 398, rx: 92 };
  const jb = { cy: 840, rx: 122 };
  const jugBody = `M${jx - jr.rx} ${jr.cy}L${jx - jb.rx} ${jb.cy}${arc(jb.rx, jx + jb.rx, jb.cy, 0, 0)}L${jx + jr.rx} ${jr.cy}${arc(jr.rx, jx - jr.rx, jr.cy, 0, 1)}Z`;
  const jugFull = `M${jx - jr.rx} ${jr.cy}L${jx - jb.rx} ${jb.cy}${arc(jb.rx, jx + jb.rx, jb.cy, 0, 0)}L${jx + jr.rx} ${jr.cy}${arc(jr.rx, jx - jr.rx, jr.cy, 0, 0)}Z`;
  const lip = `M${jx - 80} ${jr.cy - 12}Q${jx - 112} ${jr.cy - 14} ${jx - 140} ${jr.cy - 2}Q${jx - 112} ${jr.cy + 8} ${jx - 84} ${jr.cy + 14}Z`;
  const handle = `M${jx + 88} 440H${jx + 158}C${jx + 204} 440 ${jx + 206} 540 ${jx + 176} 604C${jx + 158} 642 ${jx + 136} 668 ${jx + 112} 688L${jx + 104} 600ZM${jx + 92} 474H${jx + 150}C${jx + 172} 474 ${jx + 172} 540 ${jx + 148} 590C${jx + 136} 614 ${jx + 124} 632 ${jx + 108} 648L${jx + 100} 560Z`;
  const jugPoly = [
    [jx - jr.rx, jr.cy + 20],
    [jx - jb.rx, jb.cy],
    ...ellPts(jx, jb.cy, jb.rx, Math.PI, 0),
    [jx + jr.rx, jr.cy + 20],
  ];
  const jugSpeckle = speckle({
    seed: 17,
    box: [jx - jb.rx, jr.cy + 40, jx + jb.rx, jb.cy + 20],
    inside: inPoly(jugPoly),
    avoid: (x, y) => x < jx - 40 && x > jx - 110 && y > 480 && y < 740,
    coverage: 0.009,
    clusters: 0,
  });
  const jShadeTop = [jx + jr.rx * 0.5, jr.cy + jr.rx * RATIO * Math.sqrt(1 - 0.25)];
  const jShadeBot = [jx + jb.rx * 0.5, jb.cy + jb.rx * RATIO * Math.sqrt(1 - 0.25)];
  const jugShade = `M${n(jShadeTop[0])} ${n(jShadeTop[1])}${arc(jr.rx, jx + jr.rx, jr.cy, 0, 0)}L${jx + jb.rx} ${jb.cy}${arc(jb.rx, jShadeBot[0], jShadeBot[1], 0, 1)}Z`;

  return hero(
    'Water hero (DESIGN.md 3.3, art pass 2). V4 faceted cafe tumbler with a heavy glass bottom, water at 75%, two bevelled ice cubes, three bubbles. Enamel jug behind and left with a water-ink rim, pouring lip and base band, one chip, sparse speckle.',
    [
      note('Cast shadows'),
      shadow(330, 858, 132),
      shadow(666, 860, 148),
      note('Jug: contour, handle, body, shade, speckle, gleam, inside, rim, lip, chip'),
      contour('contour-jug', [
        path(handle, { 'fill-rule': 'evenodd' }),
        path(jugFull),
        ell(jx, jr.cy, jr.rx, { 'stroke-width': 30 }),
        path(lip, { 'stroke-width': 30 }),
      ]),
      path(handle, { fill: C.enamel, 'fill-rule': 'evenodd' }),
      path(
        `M${jx + 186} 520C${jx + 192} 560 ${jx + 186} 590 ${jx + 176} 604C${jx + 158} 642 ${jx + 136} 668 ${jx + 112} 688L${jx + 110} 664C${jx + 128} 648 ${jx + 142} 628 ${jx + 152} 606C${jx + 168} 572 ${jx + 176} 548 ${jx + 186} 520Z`,
        {
          fill: C.enamelShade,
        },
      ),
      path(jugBody, { fill: C.enamel }),
      path(jugShade, { fill: C.enamelShade }),
      jugSpeckle,
      path(`M${jx - jb.rx + 3} ${jb.cy - 14}${arc(jb.rx - 3, jx + jb.rx - 3, jb.cy - 14, 0, 0)}`, {
        fill: 'none',
        stroke: C.inkWater,
        'stroke-width': 12,
      }),
      gleam(
        [
          [jx - 64, 470],
          [jx - 70, 560],
          [jx - 76, 650],
          [jx - 82, 730],
        ],
        24,
      ),
      ell(jx, jr.cy, jr.rx, { fill: C.enamelShade }),
      ell(jx, jr.cy + 8, jr.rx - 16, { fill: C.water }),
      path(lip, { fill: C.enamel }),
      ell(jx, jr.cy, jr.rx, { fill: 'none', stroke: C.inkWater, 'stroke-width': 14 }),
      path(
        `M${jx - 84} ${jr.cy - 11}Q${jx - 112} ${jr.cy - 14} ${jx - 140} ${jr.cy - 2}Q${jx - 112} ${jr.cy + 8} ${jx - 86} ${jr.cy + 13}`,
        {
          fill: 'none',
          stroke: C.inkWater,
          'stroke-width': 14,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        },
      ),
      chip(jx, jr.cy, jr.rx, Math.PI * 0.36, 0.9),
      note('Tumbler: contour (offset outward, since glass is see-through), body'),
      glassContour('contour-glass', gl.contourParts),
      path(gl.body, { fill: C.glass, 'fill-opacity': '0.5' }),
      note('Water, shade, ice, bubbles, heavy bottom'),
      path(wt.d, { fill: C.water }),
      path(wt.shadeD, { fill: C.waterShade }),
      ...iceCube(668, 664, 80, 14),
      ...iceCube(604, wt.y - 6, 92, 8),
      path(wt.front, { fill: 'none', stroke: C.waterShade, 'stroke-width': 5 }),
      path(`${ridge}${facets.join('')}`, {
        fill: 'none',
        stroke: C.waterShade,
        'stroke-width': 5,
        'stroke-linecap': 'round',
      }),
      g({ fill: 'none', stroke: C.bubble, 'stroke-opacity': '0.6', 'stroke-width': 4 }, [
        circle(548, 760, 12),
        circle(560, 716, 9),
        circle(552, 682, 6),
      ]),
      path(wt.foot, { fill: C.glass, 'fill-opacity': '0.5' }),
      path(wt.foot, { fill: C.glass, 'fill-opacity': '0.5' }),
      gleam(
        [
          [502, 590],
          [508, 650],
          [514, 710],
          [520, 770],
        ],
        26,
      ),
      ell(cx, rim.cy, rim.rx, { fill: 'none', stroke: C.inkWater, 'stroke-width': 14 }),
    ],
  );
}

export const HEROES = { coffee, matcha, tea, smoothie_juice: smoothie, water };

/** Every hero as { 'coffee.svg': svg, ... }. Used by the art tests to catch hand edits. */
export function buildHeroes() {
  return Object.fromEntries(Object.entries(HEROES).map(([name, draw]) => [`${name}.svg`, draw()]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const only = process.argv.slice(2);
  for (const [name, draw] of Object.entries(HEROES)) {
    if (only.length && !only.includes(name)) continue;
    writeFileSync(join(OUT, `${name}.svg`), draw());
    console.log(`hero: ${name}.svg`);
  }
}
