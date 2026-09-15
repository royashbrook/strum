import {test,expect} from '@playwright/test';
import { spectrum } from './spectrum.js';
import { fakeMic } from './microphone-fixture.js';
import { filteredPluck } from './filtered-pluck.js';
import { audioFixture } from './waveform.js';
test('quiet boot, compact version/about header, no microphone without a gesture',async({page})=>{
  await fakeMic(page);await page.goto('/');await expect(page.locator('.string')).toHaveCount(6);await expect(page.locator('#demo')).toHaveCount(0);await expect(page.locator('.dock button')).toHaveCount(3);await expect(page.locator('#header-version')).toHaveText(/^v\d+\.\d+\.\d+$/);expect(await page.evaluate(()=>probe.requests)).toBe(0);await expect(page.locator('.string[data-state=tuned]')).toHaveCount(0);
  for(const size of [{width:390,height:844},{width:360,height:640},{width:430,height:932}]){await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);for(const id of ['listen','nav-about']){const box=await page.locator('#'+id).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual(size.height);}}
});
test('about keeps privacy guidance without prototype copy and returns focus',async({page})=>{await fakeMic(page);await page.goto('/');await page.locator('#nav-about').click();await expect(page.locator('#about')).not.toContainText(/prototype|draft icon|Phone-test/i);await expect(page.locator('#about')).toContainText('never recorded or uploaded');await expect(page.locator('#about-title')).toBeFocused();await page.locator('#nav-about').click();await expect(page.locator('#listen')).toBeFocused();expect(await page.evaluate(()=>probe.requests)).toBe(0);});
test('permission denial stays actionable',async({page})=>{await fakeMic(page,'reject');await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#status')).toContainText('not allowed');await expect(page.locator('#listen')).toHaveText('listen');expect(await page.evaluate(()=>probe.closes)).toBe(1);});
test('stop and about release tracks',async({page})=>{await fakeMic(page);await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');await page.locator('#listen').click();expect(await page.evaluate(()=>probe.stops)).toBe(1);await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');await page.locator('#nav-about').click();expect(await page.evaluate(()=>probe.stops)).toBe(2);});
test('late permission result is disposed after leaving tuner',async({page})=>{await fakeMic(page,'defer');await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('cancel');await page.locator('#nav-about').click();await page.evaluate(()=>resolveMic());await expect.poll(()=>page.evaluate(()=>probe.stops)).toBe(1);await page.locator('#nav-about').click();await expect(page.locator('#listen')).toHaveText('listen');});
test('backgrounding stops the microphone and does not restart it',async({page})=>{await fakeMic(page);await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(await page.evaluate(()=>probe.stops)).toBe(1);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});expect(await page.evaluate(()=>probe.requests)).toBe(1);await expect(page.locator('#listen')).toHaveText('listen');});
test('settings survive reload and blocked storage does not block boot',async({page})=>{await page.goto('/');await page.locator('#nav-settings').click();await page.locator('#gate').fill('35');await page.locator('#rejection').selectOption('0.75');await page.reload();await expect(page.locator('#gate')).toHaveValue('35');await expect(page.locator('#rejection')).toHaveValue('0.75');await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});await page.reload();await expect(page.locator('.string')).toHaveCount(6);await page.locator('#nav-settings').click();await page.locator('#gate').fill('85');await expect(page.locator('#gate-label')).toHaveText('-85 dB');});
test('reduced-motion screenshot',async({page},info)=>{await fakeMic(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#listen').click();await page.evaluate(bins=>{window.testSpectrum=bins;},Array.from(spectrum([[0,0],[1,0],[2,-15],[3,0],[4,9],[5,0]])));await expect(page.locator('.string').nth(2).locator('.reading')).toHaveText('low');await page.screenshot({path:info.outputPath('strum.png')});});

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

test('low/high labels and open listening settings fit small screens', async ({ page }, info) => {
  await fakeMic(page); await page.goto('/'); await page.locator('#listen').click();
  await page.evaluate(bins=>{window.testSpectrum=bins;},Array.from(spectrum([[2,-15],[4,9]])));
  await expect(page.locator('.string').nth(2).locator('.reading')).toHaveText('low');
  await expect(page.locator('.string').nth(4).locator('.reading')).toHaveText('high');
  for (const size of [{width:360,height:640},{width:430,height:932}]) {
    await page.setViewportSize(size);
    if(await page.locator('#settings').isHidden())await page.locator('#nav-settings').click();
    await page.locator('#precision').check();
    await page.locator('#nav-settings').click();
    await expect(page.locator('#tuner')).toBeVisible();
    for (const selector of ['.reading', '.reading-detail']) {
      expect(await page.locator(selector).evaluateAll(nodes => nodes.every(node => node.clientWidth>0&&node.scrollWidth <= node.clientWidth))).toBe(true);
    }
    await page.locator('#nav-settings').click();
    for (const id of ['listen','gate','rejection']) {
      const box = await page.locator('#'+id).boundingBox(); expect(box.y + box.height).toBeLessThanOrEqual(size.height);expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({path:info.outputPath(`settings-${size.width}.png`)});
  }
});

test('raw input is separate from tuning, capture requests music-safe settings, saved controls survive',async({page})=>{
  await fakeMic(page);await page.addInitScript(()=>localStorage.setItem('strum.settings.v1',JSON.stringify({gate:-65,rejection:.6})));await page.goto('/');
  await expect(page.locator('#gate')).toHaveValue('65');await expect(page.locator('#rejection')).toHaveValue('0.6');
  await page.locator('#listen').click();await page.locator('#nav-settings').click();
  await page.evaluate(()=>{window.testLevel=10**(-74/20);});await expect(page.locator('#input-db')).toHaveText('-74 dB');await expect(page.locator('#input-label')).toHaveText('below sensitivity');
  await page.locator('#gate').fill('85');await expect(page.locator('#input-label')).toHaveText('hearing sound');await expect(page.locator('.string[data-state=quiet]')).toHaveCount(6);
  expect(await page.evaluate(()=>probe.constraints.audio)).toEqual({echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:1}});
  await page.locator('#nav-about').click();await expect(page.locator('#mic-details')).toContainText('Noise reduction: off');
});

test('native Web Audio measures a soft fundamental through a real media stream', async ({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      const context=new AudioContext();await context.resume();
      const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=110*2**(-20/1200);gain.gain.value=10**(-72/20);
      oscillator.connect(gain);gain.connect(destination);oscillator.start();
      window.generatedAudio={context,oscillator,gain};return destination.stream;
    }}});
  });
  await page.goto('/');await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveText('stop listening');
  await page.locator('#nav-settings').click();await expect(page.locator('#input-label')).toHaveText('below sensitivity');
  await page.locator('#gate').fill('85');await expect(page.locator('.string').nth(1).locator('.reading')).toHaveText('low');
  await expect(page.locator('.string').nth(1).locator('.reading-detail')).toHaveText('↑ 20¢');
  await page.evaluate(()=>{const {context,oscillator}=generatedAudio;oscillator.frequency.value=110;generatedAudio.settledAt=context.currentTime+2*32768/context.sampleRate;});
  await expect(page.locator('.string').nth(1)).toHaveAttribute('data-state','tuned');
  // Let a complete new-pitch window pass through both the generated stream and
  // analyser before cutting it off; the first green can still overlap old audio.
  await page.waitForFunction(()=>generatedAudio.context.currentTime>=generatedAudio.settledAt);
  await expect(page.locator('.string').nth(1)).toHaveAttribute('data-state','tuned');
  await page.evaluate(()=>{generatedAudio.gain.gain.value=0;});await expect(page.locator('.string').nth(1)).toHaveAttribute('data-held','true');
  await page.locator('#listen').click();await page.evaluate(()=>generatedAudio.context.close());
});

test('filtered low E never latches a ghost B, while a quiet real B still greens', async ({page})=>{
  await fakeMic(page);await page.goto('/');await page.locator('#listen').click();
  const filtered=filteredPluck();
  await page.evaluate(frame=>{window.testSpectrum=frame.bins;window.testLevel=10**(frame.rms/20);}, {bins:Array.from(filtered.spectrum),rms:filtered.rms});
  const b=page.locator('.string').nth(4);
  await expect(b).toHaveAttribute('data-state','uncertain');
  await page.waitForTimeout(500);
  await expect(b).toHaveAttribute('data-state','uncertain');
  await expect(b).toHaveAttribute('data-held','false');
  await page.locator('#nav-settings').click();await page.locator('#gate').fill('85');
  const real=audioFixture({notes:[[4,0]],db:-72,decay:1.5});
  await page.evaluate(frame=>{window.testSpectrum=frame.bins;window.testLevel=10**(frame.rms/20);}, {bins:Array.from(real.spectrum),rms:real.rms});
  await expect(b).toHaveAttribute('data-state','tuned');
  await page.evaluate(()=>{window.testSpectrum=null;window.testLevel=0;});
  await expect(b).toHaveAttribute('data-held','true');
});
