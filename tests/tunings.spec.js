import {test,expect} from '@playwright/test';
import {fakeMic} from './microphone-fixture.js';
import {audioFixture} from './waveform.js';
import {TUNINGS} from '../src/lib/tunings.ts';

async function signal(page,hz,db=-45){
  const f=audioFixture({frequencies:[hz],db,noise:-110});
  await page.evaluate(f=>{window.testSpectrum=f.bins;window.testLevel=10**(f.rms/20);},{bins:Array.from(f.spectrum),rms:f.rms});
}

test('picker lives only in settings, saves all four tunings and keeps narrow screens usable',async({page},info)=>{
  await fakeMic(page);await page.goto('/');
  await expect(page.locator('#tuner select')).toHaveCount(0);
  await page.locator('#nav-settings').click();const select=page.getByLabel('tuning',{exact:true});
  await expect(select.locator('option')).toHaveText(['Standard','Drop D','Open D','Open G']);
  for(const t of TUNINGS){
    await select.selectOption(t.id);await page.reload();await page.locator('#nav-settings').click();
    await expect(select).toHaveValue(t.id);await page.keyboard.press('Escape');
    await expect(page.locator('.note')).toHaveText(t.strings.map(s=>s.note+s.octave));
    await page.locator('#nav-about').click();await expect(page.locator('#tuning-summary')).toContainText(t.name+':');
    await page.locator('#nav-settings').click();
  }
  for(const size of [{width:360,height:640},{width:430,height:932},{width:932,height:430}]){
    await page.setViewportSize(size);await select.scrollIntoViewIfNeeded();
    const b=await select.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.x+b.width).toBeLessThanOrEqual(size.width);
    expect(await select.evaluate(n=>{const b=n.getBoundingClientRect();return n===document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);})).toBe(true);
    expect(await page.evaluate(()=>scrollY)).toBe(0);await expect(page.locator('#listen')).toBeInViewport();
    await page.screenshot({path:info.outputPath(`tunings-${size.width}.png`)});
  }
  expect(await page.evaluate(()=>probe.requests)).toBe(0);
});

test('active-mic switch clears green and motion, uses the new targets, and leaves the mic open',async({page})=>{
  await fakeMic(page);await page.goto('/');await page.locator('#listen').click();await signal(page,110);
  await expect(page.locator('.string').nth(1)).toHaveAttribute('data-state','tuned');
  await page.evaluate(()=>{window.testSpectrum=null;window.testLevel=0;});
  await expect(page.locator('.string').nth(1)).toHaveAttribute('data-held','true');
  await page.locator('#nav-settings').click();await page.locator('#tuning').selectOption('open-g');
  await expect(page.locator('.string[data-state=quiet]')).toHaveCount(6);
  await page.keyboard.press('Escape');await expect(page.locator('.note')).toHaveText(['D2','G2','D3','G3','B3','D4']);
  for(const n of await page.locator('.pitch-position').all())expect(await n.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m42)).toBeCloseTo(0);
  await signal(page,82.406889);await expect(page.locator('.string').first()).toHaveAttribute('data-state','sharp');
  await signal(page,73.416192);await expect(page.locator('.string').first()).toHaveAttribute('data-state','tuned');
  expect(await page.evaluate(()=>({requests:probe.requests,stops:probe.stops}))).toEqual({requests:1,stops:0});
});

test('each tuning can confirm all six strings one at a time without losing held confirmations',async({page})=>{
  await fakeMic(page);await page.goto('/');await page.locator('#listen').click();
  for(const t of TUNINGS){
    await page.locator('#nav-settings').click();await page.locator('#tuning').selectOption(t.id);await page.keyboard.press('Escape');
    for(let i=0;i<6;i++){
      await signal(page,t.strings[i].hz);await expect(page.locator('.string').nth(i)).toHaveAttribute('data-state','tuned');
    }
    await page.evaluate(()=>{window.testSpectrum=null;window.testLevel=0;});
    await expect(page.locator('.string[data-state=tuned][data-held=true]')).toHaveCount(6);
  }
});

test('invalid or inaccessible tuning storage does not prevent listening',async({page})=>{
  await fakeMic(page);await page.addInitScript(()=>localStorage.setItem('strum.tuning.v1','constructor'));await page.goto('/');
  await expect(page.locator('.note')).toHaveText(['E2','A2','D3','G3','B3','E4']);
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked');};Storage.prototype.setItem=()=>{throw new Error('blocked');};});
  await page.reload();await page.locator('#nav-settings').click();await page.locator('#tuning').selectOption('open-d');
  await page.locator('#listen').click();await signal(page,184.997211);await expect(page.locator('.string').nth(3)).toHaveAttribute('data-state','tuned');
});
