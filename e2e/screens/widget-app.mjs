// Screenshots of the M2 app screens for the widget (docs/build-notes/widget-app.md) from the web
// export, on the mock data layer and the preview widget host (lib/widget/host.ts):
//   npm run export:web
//   node e2e/screens/widget-app.mjs
// 390 x 844 at 2x, light and dark, into docs/screens/widget-app/. The clock starts at Monday
// 2026-11-16 10:00 local, so Automatic resolves to the daytime group.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dist = join(root, 'app', 'dist');
const out = join(root, 'docs', 'screens', 'widget-app');
mkdirSync(out, { recursive: true });

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
async function scrollTo(page, testId) {
  await page.locator(id(testId)).last().scrollIntoViewIfNeeded();
  await pause(page, 400);
}

/** Each group opens a URL, then walks its states in order. */
const GROUPS = [
  {
    url: '/onboarding/widget?mock=setup&widgets=none&look=android',
    ready: 'screen-onb-widget',
    states: [
      ['01-onb-widget-android', async () => undefined],
      ['02-onb-widget-android-missing', (p) => tap(p, 'widget-done')],
      // The preview launcher can't pin, so the button goes and the steps stay.
      ['03-onb-widget-android-no-pin', (p) => tap(p, 'widget-pin')],
    ],
  },
  {
    url: '/onboarding/widget?mock=setup&widgets=none',
    ready: 'screen-onb-widget',
    states: [['04-onb-widget-ios-look', async () => undefined]],
  },
  {
    url: '/?mock=setup&widgets=none&look=android',
    ready: 'screen-camera',
    states: [['05-camera-add-widget-notice', async () => undefined]],
  },
  {
    // Opened by URL: the web review build drops ?look= on an in-app push.
    url: '/widget-guide?mock=setup&widgets=none&look=android',
    ready: 'screen-widget-guide',
    states: [['06-widget-guide-android', async () => undefined]],
  },
  {
    url: '/?mock=setup&look=android',
    ready: 'screen-camera',
    states: [
      ['07-camera-widget-found', async () => undefined],
      [
        '08-settings-widgets',
        async (p) => {
          await tap(p, 'top-settings');
          await scrollTo(p, 'set-widgets-guide');
        },
      ],
      ['09-widget-states', (p) => tap(p, 'set-widgets-debug')],
      ['10-widget-states-sent', (p) => tap(p, 'ws-W4')],
    ],
  },
  {
    url: '/?mock=setup&widgets=none&look=android',
    ready: 'screen-camera',
    states: [
      [
        '11-settings-widgets-none',
        async (p) => {
          await tap(p, 'top-settings');
          await scrollTo(p, 'set-widgets-guide');
        },
      ],
    ],
  },
  {
    url: '/?mock=setup&look=android&text=max',
    ready: 'screen-camera',
    states: [
      [
        '12-settings-widgets-largest-text',
        async (p) => {
          await tap(p, 'top-settings');
          await scrollTo(p, 'set-widget-41');
        },
      ],
    ],
  },
];

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let shots = 0;
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    for (const group of GROUPS) {
      const page = await context.newPage();
      await page.clock.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
      await page.goto(`${base}${group.url}`);
      await page.waitForSelector(id(group.ready));
      await pause(page, 900);
      for (const [name, step] of group.states) {
        await step(page);
        await page.screenshot({ path: join(out, `${name}-${scheme}.png`) });
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
console.log(`widget-app screens: ${shots} in docs/screens/widget-app`);
