import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from '../scripts/build.mjs';

test('recovery prompts name the visible ear control', async () => {
  for (const file of ['index.html', 'microphone.js']) {
    const source = await readFile(resolve('public', file), 'utf8');
    assert.equal(/tap listen/i.test(source), false, `${file}: stale control name`);
    assert.ok(source.includes('Tap the ear'), `${file}: name the visible control`);
  }
});

test('release contains a complete versioned module graph, stable install identity and microphone-safe headers', async () => {
  const destination = await mkdtemp(resolve(tmpdir(), 'strum-release-'));
  try {
    const id = await build(resolve('public'), destination, '0.1.1');
    const html = await readFile(resolve(destination, 'index.html'), 'utf8');
    const sw = await readFile(resolve(destination, 'sw.js'), 'utf8');
    assert.ok(!/BUILD_ID|APP_VERSION|PRECACHE_ASSETS/.test(html + sw));
    assert.ok(html.includes(`/assets/${id}/app.js`));
    assert.ok(html.includes(`/assets/${id}/app.css`));
    for (const name of ['app.js', 'pwa.js', 'analysis.js', 'microphone.js', 'tuning-memory.js', 'resonance.js', 'pitch-motion.js', 'listening.js', 'gestures.js', 'app.css']) {
      assert.ok(sw.includes(`/assets/${id}/${name}`));
      assert.ok((await readFile(resolve(destination, 'assets', id, name))).length);
    }
    for (const name of ['thumb-up.svg', 'ear.svg', 'settings.svg', 'info-circle.svg', 'hand-finger.svg', 'guitar.svg', 'third-party.txt']) {
      assert.ok(sw.includes('/' + name));
      assert.ok((await readFile(resolve(destination, name))).length);
    }
    const manifest = JSON.parse(await readFile(resolve(destination, 'manifest.json')));
    assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, 'any');
    assert.ok(!sw.includes('"/_headers"'), 'deployment headers must never enter the service-worker precache');
    for (const [file, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
      const png = await readFile(resolve(destination, file));
      assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
    }
    const headers = await readFile(resolve(destination, '_headers'), 'utf8');
    assert.match(headers, /microphone=\(self\)/); assert.match(headers, /\/version\.json\n  Cache-Control: no-store/);
    for (const route of ['/', '/index.html', '/sw.js']) assert.ok(headers.includes(`${route}\n  Cache-Control: no-store`));
    assert.equal(JSON.parse(await readFile(resolve(destination, 'version.json'))).build, id);
    const changed = await build(resolve('public'), destination, '0.1.2'); assert.notEqual(id, changed);
  } finally { await rm(destination, { recursive: true, force: true }); }
});
