// The dark-mode rule for drink icons (DESIGN.md 3.2 "Outline colour by theme", round 3), shared by
// every export: scripts/gen-drink-assets.mjs (Android widget), build-sheet.mjs (contact sheet) and,
// once ported, app/src/ui/art/art.ts (the app). One rule, so the app and the widget match.
//
// The masters are drawn for light surfaces. Swapping the #17202A outline for #EEF2F5 (the rule
// until round 3) made a white cup, its pale outline and a white saucer one blob on a dark panel
// (design review item 3). Now the icon keeps its light-mode drawing, steel lines inside included,
// and gets a light contour around its outer silhouette only, the way the heroes do in dark mode
// (3.2 "Heroes"): every drawn shape is copied behind the drawing, filled and stroked in the
// contour colour, `width` units wider on each side. The gleam drops to its dark opacity.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const THEME = JSON.parse(readFileSync(join(HERE, '../theme.json'), 'utf8'));

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect']);
const GEOMETRY = ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'transform'];
const INHERITED = ['fill', 'stroke', 'stroke-width'];

function parse(src) {
  const text = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/g, '');
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, rawAttrs, self] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!self) stack.push(node);
  }
  return root.children.find((c) => c.name === 'svg');
}

const r3 = (n) => String(Math.round(n * 1000) / 1000);

/** The contour copies of `node`'s children, as SVG text. */
function contour(node, style, color, width) {
  let out = '';
  for (const child of node.children) {
    const own = { ...style };
    for (const k of INHERITED) if (child.attrs[k] !== undefined) own[k] = child.attrs[k];
    const geo = GEOMETRY.filter((k) => child.attrs[k] !== undefined)
      .map((k) => ` ${k}="${child.attrs[k]}"`)
      .join('');
    if (child.name === 'g') {
      const inner = contour(child, own, color, width);
      if (inner) out += child.attrs.transform ? `<g transform="${child.attrs.transform}">${inner}</g>` : inner;
      continue;
    }
    if (!SHAPES.has(child.name)) continue;
    const fill = own.fill ?? '#000000';
    const stroke = own.stroke ?? 'none';
    if (fill === 'none' && stroke === 'none') continue;
    const sw = (stroke === 'none' ? 0 : Number(own['stroke-width'] ?? 1)) + 2 * width;
    out +=
      `<${child.name}${geo} fill="${fill === 'none' ? 'none' : color}" stroke="${color}"` +
      ` stroke-width="${r3(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return out;
}

/** Contour width per side, in units of the icon's grid. */
export function contourWidth(svg) {
  const vb = (parse(svg).attrs.viewBox ?? '0 0 24 24').trim().split(/[\s,]+/).map(Number);
  return Math.max(vb[2], vb[3]) <= 24 ? THEME.darkContour.width24 : THEME.darkContour.width64;
}

/** The dark-mode icon: the light drawing on a light contour around its silhouette. */
export function darkIcon(svg) {
  const color = THEME.darkContour.color;
  const halo = contour(parse(svg), {}, color, contourWidth(svg));
  const { light, dark } = THEME.gleamOpacity;
  const body = svg.replace(
    new RegExp(`((?:fill|stroke)-opacity=")${light.replace('.', '\\.')}(")`, 'g'),
    `$1${dark}$2`,
  );
  return body.replace(/(<svg\b[^>]*>)/, `$1<g id="dark-contour">${halo}</g>`);
}
