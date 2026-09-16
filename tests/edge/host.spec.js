import { test, expect } from '@playwright/test';
import { fakeMic } from '../microphone-fixture.js';
import { spectrum } from '../spectrum.js';

test('the actual asset host enforces headers without breaking tuning, motion or worker installation', async ({page, request}) => {
  const errors = [], violations = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('recordViolation', value => violations.push(value));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => {
    window.recordViolation({directive:e.violatedDirective, blocked:e.blockedURI});
  }));
  await fakeMic(page);
  const response = await page.goto('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).not.toContain('unsafe-inline');
  expect(headers['permissions-policy']).toContain('microphone=(self)');
  expect(headers['cache-control']).toContain('no-store');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect((await request.get('/_headers')).status()).toBe(404);
  for(const path of ['/sw.js','/version.json']) {
    const result = await request.get(path);
    expect(result.ok()).toBe(true);
    expect(result.headers()['cache-control']).toContain('no-store');
  }
  const script = await page.locator('script[type=module]').getAttribute('src');
  expect(script).toMatch(/^\/assets\/.+\.js$/);
  expect((await request.get(script)).headers()['cache-control']).toContain('immutable');
  await page.locator('#listen').click();
  await page.evaluate(bins => {window.testSpectrum=bins;window.testLevel=.1;},Array.from(spectrum([[1,-20]])));
  const string = page.locator('.string').nth(1);
  await expect(string).toHaveAttribute('data-state','flat');
  await expect.poll(()=>string.locator('.pitch-position').evaluate(n=>getComputedStyle(n).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  await page.locator('#listen').click();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  // Offline navigation itself is covered with a severed server in pwa.spec.js.
  const cached = await page.evaluate(async()=>{
    const cache = await caches.open((await caches.keys()).find(k=>k.startsWith('strum-')));
    return (await cache.keys()).map(r=>new URL(r.url).pathname);
  });
  expect(cached).toContain('/');expect(cached).toContain(script);
  expect(cached).not.toContain('/_headers');
  expect(errors).toEqual([]);expect(violations).toEqual([]);
});
