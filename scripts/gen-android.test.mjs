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
import { buildAssets, buildIconsKotlin, darkIcon, svgToVector } from './gen-drink-assets.mjs';

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
  assert.equal(darkIcon('stroke="#17202A"'), 'stroke="#EEF2F5"');
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
