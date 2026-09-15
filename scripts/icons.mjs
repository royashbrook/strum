import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const svg = await readFile('public/icon.svg', 'utf8'), browser = await chromium.launch();
try {
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>body{margin:0}svg{width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: `public/icon-${size}.png` }); await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0;background:#15171a;display:grid;place-items:center;height:512px}svg{width:440px;height:440px}</style>${svg}`);
  await page.screenshot({ path: 'public/icon-maskable-512.png' });
} finally { await browser.close(); }
