import {test,expect} from '@playwright/test';
import {fakeMic} from './microphone-fixture.js';
import {spectrum} from './spectrum.js';
import {audioFixture} from './waveform.js';

test('three named icon controls, separate settings, absolute top-right version on every screen',async({page},info)=>{
  await fakeMic(page);await page.goto('/');
  await expect(page.locator('#settings')).toBeHidden();await expect(page.locator('#tuner #settings, .guidance')).toHaveCount(0);
  expect(await page.locator('#listen-label').evaluate(n=>getComputedStyle(n).clipPath)).toBe('inset(50%)');
  for(const size of [{width:360,height:640},{width:430,height:932},{width:932,height:430},{width:1200,height:800}]){
    await page.setViewportSize(size);
    for(const view of ['tuner','settings','about']){
      if(view==='tuner')await page.keyboard.press('Escape');
      else await page.locator('#nav-'+view).click();
      await expect(page.locator('#'+view)).toBeVisible();
      if(view==='tuner'){
        for(const numbers of [false,true]){
          await page.locator('#nav-settings').click();await page.locator('#precision').setChecked(numbers);await page.keyboard.press('Escape');
          for(const string of await page.locator('.string').all()){
            const rail=await string.locator('.rail').boundingBox(),label=await string.locator('.note-label').boundingBox();
            expect(label.y-(rail.y+rail.height),'note labels clear the rail end in both display modes').toBeGreaterThanOrEqual(8);
          }
        }
        await page.locator('#nav-settings').click();await page.locator('#precision').uncheck();await page.keyboard.press('Escape');
      }
      const v=await page.locator('#header-version').boundingBox();
      expect(size.width-v.x-v.width).toBeCloseTo(16,0);expect(v.y).toBeCloseTo(18,0);
      for(const id of ['listen','nav-settings','nav-about']){
        const button=page.locator('#'+id),b=await button.boundingBox();
        expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.y+b.height).toBeLessThanOrEqual(size.height);
        expect(await button.getAttribute('aria-label')).toBeTruthy();
        expect(await button.evaluate(n=>{const b=n.getBoundingClientRect();return n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(size.height);
      await page.screenshot({path:info.outputPath(`${view}-${size.width}.png`)});
    }
  }
  expect(await page.evaluate(()=>probe.requests)).toBe(0);
});

test('ear is a one-action start/stop; settings tune the live mic; About stops it',async({page})=>{
  await fakeMic(page);await page.goto('/');await page.locator('#nav-settings').click();
  await expect(page.locator('#settings-title')).toBeFocused();expect(await page.evaluate(()=>probe.requests)).toBe(0);
  await page.locator('#listen').click();await expect(page.locator('#tuner')).toBeVisible();await expect(page.locator('#listen')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>probe.requests)).toBe(1);
  await page.locator('#nav-settings').click();await expect(page.locator('#input-signal')).toBeVisible();
  await page.getByRole('radio',{name:'Noisy room'}).check();expect(await page.evaluate(()=>probe.stops)).toBe(0);
  await page.locator('#nav-settings').click();await expect(page.locator('#tuner')).toBeVisible();expect(await page.evaluate(()=>probe.stops)).toBe(0);
  await page.locator('#listen').click();await expect(page.locator('#listen')).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>probe.stops)).toBe(1);
  await page.locator('#nav-about').click();await page.locator('#listen').click();await expect(page.locator('#tuner')).toBeVisible();expect(await page.evaluate(()=>probe.requests)).toBe(2);
  await page.locator('#nav-about').click();expect(await page.evaluate(()=>probe.stops)).toBe(2);
});

test('strumming hand teaches once per opening, never fakes readings or retires on noise',async({page})=>{
  await fakeMic(page);await page.goto('/');const cue=page.locator('#strum-cue');
  await expect(cue).toBeVisible();expect(await page.evaluate(()=>probe.requests)).toBe(0);
  await expect(cue).toHaveAttribute('data-stage','tap');
  const hand=cue.locator('.cue-hand');
  await hand.evaluate(n=>{const a=n.getAnimations()[0];a.pause();a.currentTime=1000;});
  const first=await hand.boundingBox(),ear=await page.locator('#listen').boundingBox();
  expect(first.y).toBeGreaterThan(ear.y);expect(first.y).toBeLessThan(ear.y+ear.height);
  await hand.evaluate(n=>n.getAnimations()[0].currentTime=2800);
  const second=await hand.boundingBox();expect(second.y).toBeLessThan(first.y-60);
  await expect(cue.locator('.cue-guitar')).toHaveCount(1);
  await expect(page.locator('.string[data-state=quiet]')).toHaveCount(6);
  await page.locator('#listen').click();
  await expect(cue).toHaveAttribute('data-stage','strum');await expect(page.locator('#status')).toHaveText('Strum your guitar.');
  const noise=audioFixture({frequencies:[],noise:-35});
  await page.evaluate(f=>{window.testSpectrum=f.bins;window.testLevel=10**(f.rms/20);},{bins:Array.from(noise.spectrum),rms:noise.rms});
  await page.waitForTimeout(400);await expect(cue).toBeVisible();
  await page.evaluate(bins=>{window.testSpectrum=bins;window.testLevel=.1;},Array.from(spectrum([[1,-20]])));
  await expect(cue).toBeHidden();await expect(page.locator('#status')).toHaveText('Let it ring.');
  await page.locator('#listen').click();await expect(cue).toBeHidden();
  await page.reload();await expect(cue).toBeVisible();
});

test('cue respects reduced motion, hidden pages, and pending permission cancellation',async({page})=>{
  await fakeMic(page,'defer');await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const cue=page.locator('#strum-cue');await expect(cue).toBeVisible();
  expect(await cue.locator('.cue-hand').evaluate(n=>getComputedStyle(n).animationName)).toBe('none');
  await page.locator('#nav-settings').click();await expect(cue).toBeHidden();await page.keyboard.press('Escape');await expect(cue).toBeVisible();
  await page.locator('#listen').click();await expect(cue).toBeHidden();await page.locator('#nav-settings').click();
  await page.evaluate(()=>resolveMic());await expect.poll(()=>page.evaluate(()=>probe.stops)).toBe(1);await expect(page.locator('#listen')).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Escape');await expect(cue).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(cue).toBeHidden();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(cue).toBeVisible();expect(await page.evaluate(()=>probe.requests)).toBe(1);
});
