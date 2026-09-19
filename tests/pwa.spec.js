import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { build } from '../scripts/build.mjs';
import { fakeMic } from './microphone-fixture.js';
import { legacyBuild } from './legacy-release.js';

let directory, server, origin, root, nextRoot, first, second, breakDownload, networkDown, stallProbe;
// Both the pinned release and current app allow 8 seconds before aborting a
// stalled version fetch. Leave 2 seconds for rendering, not a shorter 5s oracle.
const updateFailureBudget = 10_000;
const builds = {};
test.beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'strum-pwa-'));
  builds.a = await legacyBuild(resolve(directory, 'a'));
  builds.b = await build(process.cwd(), resolve(directory, 'b'), '1.0.0');
  builds.c = await build(process.cwd(), resolve(directory, 'c'), '1.0.1');
  server = createServer(async (request, response) => {
    if (networkDown) { request.socket.destroy(); return; }
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (/^\/dynamic-\d+$/.test(pathname)) { response.writeHead(200).end(pathname); return; }
      if (stallProbe && pathname === '/version.json') return;
      if (breakDownload && pathname.startsWith('/assets/') && pathname.endsWith('.js')) { response.writeHead(503).end(); return; }
      const base = resolve(directory, root), file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(base + sep)) { response.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
test.beforeEach(() => { root = 'a'; breakDownload = false; networkDown = false; stallProbe = false; });
async function disconnect(context, browserName) {
  // WebKit's automation offline switch aborts navigation before the worker can
  // answer on this host. Cut the actual server connection instead; no mocked SW.
  if (browserName === 'webkit') networkDown = true;
  else await context.setOffline(true);
}
async function boot(page) {
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('#version')).toContainText(first);
  await expect(page.locator('#update-notice')).toBeHidden();
}

for (const base of ['a', 'b']) test.describe(base === 'a' ? 'installed v0.1.10' : 'Svelte release', () => {
test.beforeEach(() => {
  root = base; nextRoot = base === 'a' ? 'b' : 'c';
  first = builds[base]; second = builds[nextRoot];
});

test('query and path variation cannot grow the installed shell cache', async ({ page, context, browserName }) => {
  test.skip(base === 'a', 'the pinned legacy release predates the cache boundary');
  await boot(page);
  const keys = () => page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('strum-'));
    return (await (await caches.open(name)).keys()).map(request => request.url).sort();
  });
  const before = await keys();
  for (let i = 0; i < 20; i++) await page.goto(`${origin}/?cache-variant=${i}`);
  await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      await fetch(`/manifest.json?variant=${i}`);
      await fetch(`/dynamic-${i}`);
      await fetch(`/missing-${i}`);
    }
  });
  expect(await keys()).toEqual(before);
  await disconnect(context, browserName);
  await page.goto(`${origin}/?offline-variant=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.string')).toHaveCount(6);
  expect(await page.evaluate(async () => (await fetch('/manifest.json?offline=1')).ok)).toBe(true);
  expect(await keys()).toEqual(before);
});

test('installed shell survives network loss and all about links own 44px targets', async ({ page, context, browserName }) => {
  await boot(page);
  await disconnect(context, browserName); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.string')).toHaveCount(6);
  await expect(page.locator('#listen')).toHaveText('listen');
  await page.locator('#nav-about').click();
  for (const link of await page.locator('.mark a').all()) {
    const box = await link.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#check-update').click(); await expect(page.locator('#update-status')).toContainText('Could not check', { timeout: updateFailureBudget });
  await expect(page.locator('#update-notice')).toBeHidden();
});

test('a stalled version request reaches its deadline and permits a retry', async ({ page }) => {
  await boot(page);
  await page.locator('#nav-about').click();
  const button = page.locator('#check-update'), status = page.locator('#update-status');
  await expect(button).toBeEnabled();
  stallProbe = true;
  const started = Date.now();
  await button.click();
  await expect(status).toHaveText('Checking…');
  await expect(status).toContainText('Could not check', { timeout: updateFailureBudget });
  expect(Date.now() - started).toBeGreaterThanOrEqual(7000);
  await expect(button).toBeEnabled();
  await expect(page.locator('#update-notice')).toBeHidden();
  stallProbe = false;
  await button.click();
  await expect(status).toHaveText('You’re up to date.');
});

test('real A-to-B worker update waits for consent and preserves settings', async ({ page, context, browserName }) => {
  await fakeMic(page);
  await boot(page);
  await page.locator('#nav-settings').click(); await page.getByRole('radio',{name:'Noisy room'}).check(); await page.locator('#tuning').selectOption('open-d'); await page.locator('#nav-settings').click();
  await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');
  await page.evaluate(() => { window.sameSession = true; });
  root = nextRoot;
  // Same event as returning to an installed app; no manual worker injection.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#update-notice')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#version')).toContainText(first);
  await expect(page.locator('#listen')).toHaveText('stop listening');expect(await page.evaluate(()=>probe.stops)).toBe(0);
  expect(await page.evaluate(() => window.sameSession)).toBe(true);
  await page.locator('#later-update').click(); await expect(page.locator('#update-notice')).toBeHidden();
  await page.locator('#nav-about').click(); await page.locator('#check-update').click(); await expect(page.locator('#update-notice')).toBeVisible();
  const button = await page.locator('#apply-update').boundingBox(); expect(button.height).toBeGreaterThanOrEqual(44);
  await page.locator('#nav-about').click();await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');
  await page.locator('#apply-update').click();
  await expect(page.locator('#version')).toContainText(second, { timeout: 15000 });
  await expect(page.locator('#update-notice')).toBeHidden();
  await expect(page.locator('input[value=noisy]')).toBeChecked();
  await expect(page.locator('#tuning')).toHaveValue('open-d');
  await expect(page.locator('.note')).toHaveText(['D2','A2','D3','F♯3','A3','D4']);
  await expect(page.locator('#listen')).toHaveText('listen');
  expect(await page.evaluate(()=>sessionStorage.getItem('test-track-stops'))).toBe('2');
  await disconnect(context, browserName); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#version')).toContainText(second);
  await expect(page.locator('input[value=noisy]')).toBeChecked();
  await expect(page.locator('#tuning')).toHaveValue('open-d');
  await expect(page.locator('.note')).toHaveText(['D2','A2','D3','F♯3','A3','D4']);
});

test('incomplete new release cannot activate or advertise itself as downloaded', async ({ page }) => {
  await boot(page); root = nextRoot; breakDownload = true;
  await page.locator('#nav-about').click(); await page.locator('#check-update').click();
  await expect(page.locator('#update-status')).toContainText('Download failed', { timeout: 15000 });
  await expect(page.locator('#update-notice')).toBeHidden();
  await expect(page.locator('#version')).toContainText(first);
  breakDownload = false;
  await page.locator('#check-update').click();
  await expect(page.locator('#update-notice')).toBeVisible({ timeout: 15000 });
  await page.locator('#apply-update').click();
  await expect(page.locator('#version')).toContainText(second, { timeout: 15000 });
});

test('iPhone install explains the real Safari flow; installed mode hides it', async ({ browser }) => {
  for (const standalone of [false, true]) {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    await context.addInitScript(value => Object.defineProperty(navigator, 'standalone', { value }), standalone);
    const page = await context.newPage(); await boot(page);
    if (standalone) {await expect(page.locator('#install-coach')).toBeHidden();await page.locator('#nav-about').click();await expect(page.locator('#install')).toBeHidden();}
    else {
      await expect(page.locator('#install-coach')).toBeVisible();await page.locator('#install-shortcut').click();await expect(page.locator('#install-hint')).toBeVisible();await expect(page.locator('#install-hint')).toContainText('Add to Home Screen');
      await page.reload();await page.locator('#dismiss-install').click();await page.reload();await expect(page.locator('#install-coach')).toBeHidden();
      await page.locator('#nav-about').click();await page.locator('#install').click();await expect(page.locator('#install-hint')).toBeVisible();
    }
    await context.close();
  }
});

test('a first worker reported as waiting and controlling is not a new version', async ({ page }) => {
  await page.addInitScript(() => {
    const worker = { postMessage(message, ports) {
      if (message.type === 'VERSION') ports[0].postMessage({ build: document.querySelector('meta[name="strum-build"]').content });
    } };
    const registration = { waiting: worker, active: worker, update: async () => {}, addEventListener() {} };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      controller: worker, register: async () => registration, addEventListener() {},
    } });
  });
  await page.goto(origin); await page.locator('#nav-about').click();
  await expect(page.locator('#update-status')).toHaveText('Saved for offline use.');
  await expect(page.locator('#update-notice')).toBeHidden();
  await page.locator('#check-update').click();
  await expect(page.locator('#update-status')).toHaveText('Saved for offline use.');
  await expect(page.locator('#update-notice')).toBeHidden();
});
});
