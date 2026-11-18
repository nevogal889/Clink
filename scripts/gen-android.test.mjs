// Offline checks for the Android widget generators and the clink-native config plugin.
//   node --test scripts/gen-android.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

import { REPO_ROOT } from '../packages/shared/tools/copy-md.mjs';
import { buildShapes, readTokens, resourceName as colorName } from './gen-android-colors.mjs';
import {
  STRINGS_JSON,
  buildXml,
  escapeAndroid,
  pickWidgetStrings,
  resourceName,
} from './gen-android-strings.mjs';
import {
  buildAssets,
  buildIconsKotlin,
  cropViewBox,
  darkIcon,
  drawnBounds,
  svgToVector,
} from './gen-drink-assets.mjs';

const KOTLIN = join(REPO_ROOT, 'app/modules/clink-native/android/src');
const strings = JSON.parse(readFileSync(STRINGS_JSON, 'utf8')).strings;

function kotlinFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.kt'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

test('string resources: every widget key, unique names, aapt-safe text', () => {
  const picked = pickWidgetStrings(strings);
  assert.ok(picked.length > 100);
  for (const k of ['wm.pick.title', 'ws.log', 'a11y.w.tracker', 'fmt.ago.hm', 'cat.coffee']) {
    assert.ok(
      picked.some(([key]) => key === k),
      k,
    );
  }
  assert.equal(resourceName('wm.pick.water'), 'clink_wm_pick_water');
  assert.equal(escapeAndroid('Couldn\'t <send> & "go"'), 'Couldn\\\'t &lt;send&gt; &amp; \\"go\\"');
  assert.equal(escapeAndroid('@x'), '\\@x');
  assert.equal(buildXml(strings), buildXml(strings), 'deterministic');
});

test('Kotlin uses only generated string keys and no string literals in Text()', () => {
  const xml = buildXml(strings);
  const defined = new Set([...xml.matchAll(/name="(clink_[a-z0-9_]+)"/g)].map((m) => m[1]));
  for (const file of kotlinFiles(KOTLIN)) {
    if (file.includes('/test/')) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/R\.string\.(clink_[a-z0-9_]+)/g)) {
      assert.ok(defined.has(m[1]), `${file}: R.string.${m[1]} is not generated from COPY.md`);
    }
    assert.ok(!/\bText\(\s*"/.test(src), `${file}: Text() with a literal string`);
  }
});

test('colour tokens: light and dark, every category role', () => {
  const t = readTokens();
  for (const mode of ['light', 'dark']) {
    for (const cat of ['coffee', 'matcha', 'tea', 'smoothie_juice', 'water']) {
      for (const role of ['solid', 'onSolid', 'tint', 'ink']) {
        assert.match(t[mode][`${cat}_${role}`], /^#[0-9A-F]{6}$/);
      }
    }
  }
  assert.equal(t.light.cobalt, '#2443A6');
  assert.equal(t.dark.surfaceBase, '#131A22');
  assert.equal(colorName('onSolid'), 'clink_on_solid');
  const shapes = buildShapes();
  for (const [, xml] of shapes) {
    for (const m of xml.matchAll(/@color\/(clink_[a-z_]+)/g)) {
      assert.ok(
        Object.keys(t.light).some((k) => colorName(k) === m[1]),
        `${m[1]} is not a generated colour`,
      );
    }
  }
});

test('drawables: every master converts, icons have night variants, Kotlin lookup matches', async () => {
  const assets = await buildAssets();
  const day = assets.filter(([p]) => p.startsWith('drawable/')).map(([p]) => p.slice(9));
  const night = new Set(
    assets.filter(([p]) => p.startsWith('drawable-night/')).map(([p]) => p.slice(15)),
  );
  const icons = readdirSync(join(REPO_ROOT, 'app/assets/art/icons')).filter((f) =>
    f.endsWith('.24.svg'),
  );
  const iconS = day.filter((f) => f.startsWith('clink_icon_') && !f.startsWith('clink_icon_l_'));
  assert.equal(iconS.length, icons.length);
  // Icon L for every drink too (widget tile, picker, confirmation).
  assert.equal(day.filter((f) => f.startsWith('clink_icon_l_')).length, icons.length);
  // Icon L is cropped to what is drawn, inside the 64 grid, light and night on the same viewport.
  const viewport = (xml) =>
    xml
      .match(/viewportWidth="([\d.]+)"\s+android:viewportHeight="([\d.]+)"/)
      .slice(1)
      .map(Number);
  const byPath = new Map(assets);
  for (const f of day.filter((x) => x.startsWith('clink_icon_l_'))) {
    const [w, h] = viewport(byPath.get(`drawable/${f}`));
    assert.ok(w <= 64 && h <= 64 && (w < 64 || h < 64), `${f} is not cropped (${w} x ${h})`);
    assert.deepEqual(viewport(byPath.get(`drawable-night/${f}`)), [w, h]);
  }
  for (const f of day) assert.ok(night.has(f), `${f} has no night`);
  const kt = buildIconsKotlin();
  assert.ok(kt.includes('"coffee.flat_white" -> R.drawable.clink_icon_coffee_flat_white'));
  assert.ok(kt.includes('"coffee.flat_white" -> R.drawable.clink_icon_l_coffee_flat_white'));
  assert.ok(kt.includes('"water.still" -> R.drawable.clink_icon_water_still'));
});

test('SVG conversion: shapes, inheritance, transforms, refusals', () => {
  const xml = svgToVector(
    '<svg viewBox="0 0 24 24"><g fill="none" stroke="#17202A" stroke-width="2"><circle cx="12" cy="12" r="4"/>' +
      '<rect x="1" y="1" width="4" height="4" rx="1" transform="rotate(10 3 3)"/></g></svg>',
    { sizeDp: 24, source: 'test' },
  );
  assert.match(xml, /android:pathData="M8 12A4 4 0 1 0 16 12A4 4 0 1 0 8 12Z"/);
  assert.match(xml, /android:strokeColor="#17202A" android:strokeWidth="2"/);
  assert.match(xml, /<group android:rotation="10" android:pivotX="3" android:pivotY="3">/);
  assert.doesNotMatch(xml, /fillColor/);
  assert.throws(() =>
    svgToVector('<svg viewBox="0 0 1 1"><text>x</text></svg>', { sizeDp: 1, source: 't' }),
  );
  assert.throws(() =>
    svgToVector('<svg viewBox="0 0 1 1"><path d="M0 0" fill="url(#g)"/></svg>', {
      sizeDp: 1,
      source: 't',
    }),
  );
});

test('dark drink icons: the light drawing on a light contour around its silhouette', () => {
  // Review item 3: swapping the outline to #EEF2F5 merged a white cup and its saucer on dark
  // panels. The dark icon keeps the light drawing and adds a contour behind it (round 3).
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<g transform="translate(2 0)"><ellipse cx="20" cy="40" rx="10" ry="3" fill="#F4F6F7" stroke="#17202A" stroke-width="3"/></g>' +
    '<path d="M5 5L9 9" fill="none" stroke="#FFFFFF" stroke-width="1.68" stroke-opacity="0.85"/></svg>';
  const dark = darkIcon(svg);
  // The drawing itself is unchanged apart from the gleam opacity: steel lines stay steel.
  assert.ok(dark.includes('fill="#F4F6F7" stroke="#17202A" stroke-width="3"'));
  assert.ok(dark.includes('stroke-opacity="0.7"') && !dark.includes('stroke-opacity="0.85"'));
  // The contour comes first (drawn behind), keeps transforms, and is 1.75 units wider per side.
  const contour = dark.match(/<g id="dark-contour">(.*?)<\/g><g transform/)[1];
  assert.ok(contour.startsWith('<g transform="translate(2 0)"><ellipse'));
  assert.ok(contour.includes('fill="#EEF2F5" stroke="#EEF2F5" stroke-width="6.5"'));
  assert.ok(contour.includes('fill="none" stroke="#EEF2F5" stroke-width="5.18"'));
  // It converts, and the dark crop reaches past the light one by the contour.
  svgToVector(dark, { sizeDp: 64, source: 't' });
  const [lx] = cropViewBox(svg, 1);
  const [dx] = cropViewBox(dark, 1);
  assert.ok(dx < lx);
});

test('drink art crop: drawn bounds with strokes, arcs and transforms', () => {
  const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 0.05, `${a} vs ${b}`));
  // A stroked square: half the stroke on every side.
  near(
    drawnBounds(
      '<svg viewBox="0 0 64 64"><rect x="10" y="20" width="5" height="5" stroke="#17202A" stroke-width="2" fill="none"/></svg>',
    ),
    [9, 19, 16, 26],
  );
  // An ellipse's extremes, and an arc command that bulges past its end points.
  near(
    drawnBounds(
      '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="40" rx="18" ry="5.4" fill="#FFFFFF"/></svg>',
    ),
    [14, 34.6, 50, 45.4],
  );
  near(
    drawnBounds(
      '<svg viewBox="0 0 64 64"><path d="M10 40A10 10 0 0 1 30 40" fill="#FFFFFF"/></svg>',
    ),
    [10, 30, 30, 40],
  );
  // A 90 degree rotation about the square's own centre leaves it in place.
  near(
    drawnBounds(
      '<svg viewBox="0 0 64 64"><rect x="0" y="0" width="10" height="4" transform="rotate(90 5 2)" fill="#FFFFFF"/></svg>',
    ),
    [3, -3, 7, 7],
  );
  // The crop adds the margin, snaps outwards to a quarter unit and stays inside the grid.
  assert.deepEqual(
    cropViewBox(
      '<svg viewBox="0 0 64 64"><rect x="10.1" y="0" width="5" height="5" fill="#FFFFFF"/></svg>',
      1,
    ),
    [9, 0, 7.25, 6],
  );
});

test('config plugin: public meta-data only', () => {
  const require = createRequire(import.meta.url);
  const { widgetMetaValues } = require('../app/modules/clink-native/app.plugin.js');
  const values = widgetMetaValues(
    {
      scheme: 'clink-dev',
      extra: {
        variant: 'dev',
        supabase: {
          url: 'https://tppolgvuckjtxsheskat.supabase.co',
          publishableKey: 'sb_publishable_x',
        },
      },
    },
    join(REPO_ROOT, 'app'),
  );
  assert.deepEqual(values, {
    'app.clink.FUNCTIONS_URL': 'https://tppolgvuckjtxsheskat.supabase.co/functions/v1',
    'app.clink.REGION': 'eu-west-1',
    'app.clink.SCHEME': 'clink-dev',
  });
  assert.ok(!JSON.stringify(values).includes('sb_'), 'no key of any kind in the manifest');
  const mock = widgetMetaValues(
    { scheme: 'clink-dev', extra: { variant: 'dev' } },
    join(REPO_ROOT, 'app'),
  );
  assert.equal(mock['app.clink.FUNCTIONS_URL'], null);
});

test('config plugin: Android backup and device transfer are off', () => {
  const require = createRequire(import.meta.url);
  const plugin = require('../app/modules/clink-native/app.plugin.js');
  const manifest = {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }],
    },
  };
  plugin.applyNoBackup(manifest);
  const app = manifest.manifest.application[0].$;
  assert.equal(app['android:allowBackup'], 'false');
  assert.equal(app['android:dataExtractionRules'], '@xml/clink_data_extraction_rules');
  assert.deepEqual(app['tools:replace'].split(',').sort(), [
    'android:allowBackup',
    'android:dataExtractionRules',
  ]);
  assert.equal(manifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  const rules = readFileSync(
    join(
      REPO_ROOT,
      'app/modules/clink-native/android/src/main/res/xml/clink_data_extraction_rules.xml',
    ),
    'utf8',
  );
  for (const section of ['cloud-backup', 'device-transfer']) {
    const body = rules.split(`<${section}>`)[1].split(`</${section}>`)[0];
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      assert.match(
        body,
        new RegExp(`<exclude domain="${domain}" path="\\." />`),
        `${section} ${domain}`,
      );
    }
  }
});
