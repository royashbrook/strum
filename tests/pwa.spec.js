import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { build } from '../scripts/build.mjs';
import { fakeMic } from './microphone-fixture.js';

let directory, server, origin, root, first, second, breakDownload, networkDown;
test.beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'strum-pwa-'));
  first = await build(resolve('public'), resolve(directory, 'a'), '0.1.0');
  second = await build(resolve('public'), resolve(directory, 'b'), '0.1.1');
  server = createServer(async (request, response) => {
    if (networkDown) { request.socket.destroy(); return; }
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (breakDownload && pathname.endsWith('/analysis.js')) { response.writeHead(503).end(); return; }
      const base = resolve(directory, root), file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(base + sep)) { response.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
test.beforeEach(() => { root = 'a'; breakDownload = false; networkDown = false; });
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

test('installed shell survives network loss and all about links own 44px targets', async ({ page, context, browserName }) => {
  await boot(page);
  await disconnect(context, browserName); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.string')).toHaveCount(6);
  await expect(page.locator('#listen')).toHaveText('listen');
  await page.locator('#nav-about').click();
  for (const link of await page.locator('.mark a').all()) {
    const box = await link.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#check-update').click(); await expect(page.locator('#update-status')).toContainText('Could not check');
  await expect(page.locator('#update-notice')).toBeHidden();
});

test('real A-to-B worker update waits for consent and preserves settings', async ({ page, context, browserName }) => {
  await fakeMic(page);
  await boot(page);
  await page.locator('#nav-settings').click(); await page.locator('#gate').fill('35'); await page.locator('#nav-settings').click();
  await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');
  await page.evaluate(() => { window.sameSession = true; });
  root = 'b';
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
  await expect(page.locator('#gate')).toHaveValue('35');
  await expect(page.locator('#listen')).toHaveText('listen');
  expect(await page.evaluate(()=>sessionStorage.getItem('test-track-stops'))).toBe('2');
  await disconnect(context, browserName); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#version')).toContainText(second);
  await expect(page.locator('#gate')).toHaveValue('35');
});

test('incomplete new release cannot activate or advertise itself as downloaded', async ({ page }) => {
  await boot(page); root = 'b'; breakDownload = true;
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
