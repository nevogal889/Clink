// Takes the review screenshots in docs/screens from the web export (docs/build-notes/screens.md).
//   npm run export:web
//   node docs/screens/capture.mjs            # every state, light and dark
//   node docs/screens/capture.mjs 13 21      # only states whose file name starts with these
//   node docs/screens/capture.mjs --out=app-round3 --width=360 --height=780 24 25
//                                            # into docs/screens/app-round3, at 360 x 780
// 390 x 844 at 2x by default. The clock starts at Monday 2026-11-16 07:00 local and runs from there (a frozen
// clock would stop every animation), so Automatic resolves to the "other times" group and Meet
// times are stable between runs.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'app', 'dist');
const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outDir = join(here, flag('out') ?? '.');
const viewport = { width: Number(flag('width') ?? 390), height: Number(flag('height') ?? 844) };

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(dist, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, () => done(server)));
}

const id = (testId) => `[data-testid="${testId}"]`;
const pause = (page, ms = 700) => page.waitForTimeout(ms);

async function tap(page, testId) {
  await page.locator(id(testId)).last().click();
  await pause(page);
}

async function open(page, base, query = '', path = '') {
  // Review states run on the mock data layer; the default build talks to clink-dev.
  const q = query.includes('mock=') ? query : `?mock=new${query ? `&${query.slice(1)}` : ''}`;
  await page.goto(`${base}/${path}${q}`);
  const first = path
    ? `screen-${path}`
    : query.includes('mock=setup')
      ? 'screen-camera'
      : 'screen-sign-in';
  await page.waitForSelector(id(first));
  await pause(page, 900);
}

/** The states, in order. Each runs on a page already at the previous state of its group. */
const GROUPS = [
  {
    query: '',
    states: [
      ['01-sign-in', async () => undefined],
      ['02-onb-name', (p) => tap(p, 'signin-primary')],
      ['03-onb-usual-empty', (p) => tap(p, 'onb-continue')],
      ['04-onb-usual-preset', (p) => tap(p, 'preset-preset.mix')],
      [
        '05-onb-usual-catalog',
        async (p) => {
          await p.mouse.move(195, 400);
          await p.mouse.wheel(0, 560);
          await pause(p);
        },
      ],
      [
        '06-details-editor',
        async (p) => {
          await p.mouse.wheel(0, -2000);
          await pause(p, 300);
          await tap(p, 'slot-1-details');
        },
      ],
      [
        '06b-details-editor-picked',
        async (p) => {
          const sheet = p.locator(id('sheet-details')).last();
          await sheet.getByText('Regular', { exact: true }).click();
          await sheet.getByText('Oat milk', { exact: true }).click();
          await pause(p);
        },
      ],
      ['06c-onb-usual-with-details', (p) => tap(p, 'details-done')],
      ['07-onb-invite', (p) => tap(p, 'onb-continue')],
      ['08-onb-invite-shared', (p) => tap(p, 'share-whatsapp')],
      ['09-onb-notifications', (p) => tap(p, 'onb-continue')],
      ['10-onb-widget', (p) => tap(p, 'notif-no')],
      ['11-onb-widget-missing', (p) => tap(p, 'widget-done')],
      ['12-camera-new-user', (p) => tap(p, 'widget-later')],
    ],
  },
  {
    query: '?mock=setup',
    states: [
      ['13-camera', async () => undefined],
      ['14-other-picker', (p) => tap(p, 'pill-other')],
      ['15-to-picker', async (p) => (await tap(p, 'other-45'), await tap(p, 'cam-to'))],
      [
        '16-camera-matcha-45',
        async (p) => {
          await p.keyboard.press('Escape');
          await pause(p);
          await tap(p, 'cam-cat-matcha');
          await pause(p, 600);
        },
      ],
      ['17-camera-live', (p) => tap(p, 'cam-send')],
      ['18-camera-still', (p) => tap(p, 'cam-shutter')],
    ],
  },
  {
    query: '?mock=setup&text=max',
    states: [
      ['13b-camera-largest-text', async () => undefined],
      [
        '13c-camera-largest-text-scrolled',
        async (p) => {
          await p.mouse.move(195, 300);
          await p.mouse.wheel(0, 2000);
          await pause(p);
        },
      ],
    ],
  },
  {
    query: '?mock=setup',
    states: [
      ['19-tracker', (p) => tap(p, 'top-tracker')],
      ['20-tracker-logged', (p) => tap(p, 'quick-water')],
    ],
  },
  {
    query: '?mock=setup',
    states: [
      ['21-profile', (p) => tap(p, 'top-profile')],
      ['21b-xp-how', (p) => tap(p, 'profile-how')],
      [
        '22-usual',
        async (p) => {
          await p.keyboard.press('Escape');
          await pause(p);
          await tap(p, 'profile-usual');
        },
      ],
    ],
  },
  {
    query: '?mock=setup&look=android',
    states: [['23-camera-android-look', async () => undefined]],
  },
  {
    // The widget's Invite friends button (<scheme>:///invite).
    query: '?mock=setup&look=android',
    path: 'invite',
    states: [
      ['24-invite', async () => undefined],
      ['24b-invite-shared', (p) => tap(p, 'share-messages')],
    ],
  },
  {
    // All four flare categories on the panel (the flare panel is at the bottom of the camera).
    query: '?mock=setup&look=android',
    states: [
      ['25-flare-panel', async () => undefined],
      ['25b-flare-panel-smoothie', (p) => tap(p, 'cam-cat-smoothie_juice')],
    ],
  },
  {
    query: '?mock=setup&look=android&text=max',
    states: [
      [
        '25c-flare-panel-largest-text',
        async (p) => {
          await p.locator(id('cam-cats')).last().scrollIntoViewIfNeeded();
          await pause(p);
        },
      ],
      [
        '25d-flare-panel-largest-text-scrolled',
        async (p) => {
          await p.locator(id('cam-to')).last().scrollIntoViewIfNeeded();
          await pause(p);
        },
      ],
    ],
  },
];

mkdirSync(outDir, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let shots = 0;
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    for (const group of GROUPS) {
      const names = group.states.map(([n]) => n);
      if (only.length && !names.some((n) => only.some((o) => n.startsWith(o)))) continue;
      const page = await context.newPage();
      await page.clock.setSystemTime(new Date(2026, 10, 16, 7, 0, 0));
      await open(page, base, group.query, group.path);
      for (const [name, step] of group.states) {
        await step(page);
        if (only.length && !only.some((o) => name.startsWith(o))) continue;
        await page.screenshot({ path: join(outDir, `${name}-${scheme}.png`) });
        shots += 1;
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`capture: ${shots} screenshots in ${outDir}`);
