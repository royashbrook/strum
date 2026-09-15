import {test,expect} from '@playwright/test';
import { spectrum } from './spectrum.js';
async function fakeMic(page,behavior='resolve') {
  await page.addInitScript(behavior=>{
    window.probe={requests:0,stops:0,closes:0};
    const track={stop(){window.probe.stops++;},addEventListener(){}};
    const stream={getTracks:()=>[track]};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{window.probe.requests++;if(behavior==='reject')return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));if(behavior==='defer')return new Promise(resolve=>{window.resolveMic=()=>resolve(stream);});return Promise.resolve(stream);}}});
    window.AudioContext=class {
      constructor(){this.state='running';this.sampleRate=48000;}
      resume(){return Promise.resolve();}close(){this.state='closed';window.probe.closes++;return Promise.resolve();}
      addEventListener(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}
      createAnalyser(){return {frequencyBinCount:16384,getFloatFrequencyData(a){a.fill(-Infinity);if(window.testSpectrum)a.set(window.testSpectrum);},getFloatTimeDomainData(a){a.fill(window.testSpectrum?.length ? 0.1 : 0);}};}
    };
  },behavior);
}
test('quiet boot, six readings, two nav items, no microphone without a gesture',async({page})=>{
  await fakeMic(page);await page.goto('/');await expect(page.locator('.string')).toHaveCount(6);await expect(page.locator('nav button')).toHaveCount(2);expect(await page.evaluate(()=>probe.requests)).toBe(0);await expect(page.locator('.string[data-state=tuned]')).toHaveCount(0);
  for(const size of [{width:390,height:844},{width:360,height:640},{width:430,height:932}]){await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);for(const id of ['listen','demo','nav-tuner','nav-about']){const box=await page.locator('#'+id).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual(size.height);}}
});
test('demo is explicitly simulated and leaves no microphone running',async({page})=>{await fakeMic(page);await page.goto('/');await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('Simulated readings');expect(await page.evaluate(()=>probe.requests)).toBe(0);await page.locator('#nav-about').click();await page.locator('#nav-tuner').click();await expect(page.locator('.string[data-state=quiet]')).toHaveCount(6);});
test('permission denial stays actionable',async({page})=>{await fakeMic(page,'reject');await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#status')).toContainText('not allowed');await expect(page.locator('#listen')).toHaveText('listen');expect(await page.evaluate(()=>probe.closes)).toBe(1);});
test('stop and about release tracks',async({page})=>{await fakeMic(page);await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');await page.locator('#listen').click();expect(await page.evaluate(()=>probe.stops)).toBe(1);await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');await page.locator('#nav-about').click();expect(await page.evaluate(()=>probe.stops)).toBe(2);});
test('late permission result is disposed after leaving tuner',async({page})=>{await fakeMic(page,'defer');await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('cancel');await page.locator('#nav-about').click();await page.evaluate(()=>resolveMic());await expect.poll(()=>page.evaluate(()=>probe.stops)).toBe(1);await page.locator('#nav-tuner').click();await expect(page.locator('#listen')).toHaveText('listen');});
test('backgrounding stops the microphone and does not restart it',async({page})=>{await fakeMic(page);await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(await page.evaluate(()=>probe.stops)).toBe(1);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});expect(await page.evaluate(()=>probe.requests)).toBe(1);await expect(page.locator('#listen')).toHaveText('listen');});
test('settings survive reload and blocked storage does not block boot',async({page})=>{await page.goto('/');await page.locator('summary').click();await page.locator('#gate').fill('-35');await page.reload();await expect(page.locator('#gate')).toHaveValue('-35');await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});await page.reload();await expect(page.locator('.string')).toHaveCount(6);await page.locator('summary').click();await page.locator('#gate').fill('-40');await expect(page.locator('#gate-label')).toHaveText('-40 dB');});
test('reduced-motion screenshot',async({page},info)=>{await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#demo').click();await expect(page.locator('.string[data-state=tuned]')).toHaveCount(4);await page.screenshot({path:info.outputPath('strum.png')});});

test('tune strings sequentially, retain fading green, show low/high, and reset a new listen', async ({ page }, info) => {
  await fakeMic(page); await page.goto('/'); await page.locator('#listen').click();
  for (let i = 0; i < 6; i++) {
    await page.evaluate(bins => { window.testSpectrum = bins; }, Array.from(spectrum([[i, 0]])));
    await expect(page.locator('.string').nth(i)).toHaveAttribute('data-state', 'tuned');
  }
  await page.evaluate(() => { window.testSpectrum = null; });
  await expect(page.locator('.string[data-held=true]')).toHaveCount(6);
  await expect(page.locator('.reading-detail').first()).toHaveText('last ✓');
  await page.evaluate(bins => { window.testSpectrum = bins; }, Array.from(spectrum([[0, -20]])));
  await expect(page.locator('.string').nth(0).locator('.reading')).toHaveText('low');
  await expect(page.locator('.string').nth(0).locator('.reading-detail')).toHaveText('↑ 20¢');
  await page.evaluate(bins => { window.testSpectrum = bins; }, Array.from(spectrum([[1, 20]])));
  await expect(page.locator('.string').nth(1).locator('.reading')).toHaveText('high');
  await expect(page.locator('.string').nth(1).locator('.reading-detail')).toHaveText('↓ 20¢');
  await page.screenshot({ path: info.outputPath('remembered-tuning.png') });
  await page.evaluate(() => { window.testSpectrum = null; });
  await page.locator('#listen').click(); await page.locator('#listen').click();
  await expect(page.locator('.string[data-state=quiet]')).toHaveCount(6);
  await expect(page.locator('.string[data-held=true]')).toHaveCount(0);
});

test('motion preview cannot seed remembered tuning and low/high labels fit small screens', async ({ page }) => {
  await fakeMic(page); await page.goto('/'); await page.locator('#demo').click();
  await expect(page.locator('.string').nth(2).locator('.reading')).toHaveText('low');
  await expect(page.locator('.string').nth(4).locator('.reading')).toHaveText('high');
  for (const size of [{width:360,height:640},{width:430,height:932}]) {
    await page.setViewportSize(size);
    for (const selector of ['.reading', '.reading-detail']) {
      expect(await page.locator(selector).evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
    }
    const nav = await page.locator('nav').boundingBox(); expect(nav.y + nav.height).toBeLessThanOrEqual(size.height);
  }
  await page.locator('#listen').click(); await expect(page.locator('#listen')).toHaveText('stop listening');
  await expect(page.locator('.string[data-state=quiet]')).toHaveCount(6);
});
