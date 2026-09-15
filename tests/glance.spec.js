import {test,expect} from '@playwright/test';
import {fakeMic} from './microphone-fixture.js';
import {spectrum} from './spectrum.js';
import {audioFixture} from './waveform.js';
const setNotes=async(page,notes)=>page.evaluate(bins=>window.testSpectrum=bins,Array.from(spectrum(notes)));
const centre=async locator=>locator.evaluate(el=>{const b=el.getBoundingClientRect();return b.y+b.height/2;});

test('markers show direction and distance without visible numbers, then centre and remember',async({page},info)=>{
  await fakeMic(page);await page.goto('/');await page.locator('#listen').click();
  await setNotes(page,[[0,-40],[1,0],[2,25]]);
  const e=page.locator('.string').nth(0),a=page.locator('.string').nth(1),d=page.locator('.string').nth(2);
  await expect(e).toHaveAttribute('data-state','flat');await expect(d).toHaveAttribute('data-state','sharp');await expect(a).toHaveAttribute('data-state','tuned');await expect(a).toHaveAttribute('data-settled','true');
  await expect(e.locator('.direction')).toHaveText('↑');await expect(d.locator('.direction')).toHaveText('↓');
  await expect.poll(async()=>await centre(e.locator('.bead'))-await centre(e.locator('.target'))).toBeGreaterThan(40);
  expect(await centre(d.locator('.bead'))).toBeLessThan(await centre(d.locator('.target'))-20);
  expect(await a.locator('.thumb').evaluate(n=>getComputedStyle(n).display)).toBe('block');
  expect(await e.locator('.reading-detail').evaluate(n=>getComputedStyle(n).clipPath)).toBe('inset(50%)');
  await expect(e).toHaveAttribute('aria-label',/low, tighten gently/);
  await page.screenshot({path:info.outputPath('glanceable.png')});
  await setNotes(page,[[0,0]]);await expect(e).toHaveAttribute('data-state','tuned');
  await expect.poll(async()=>Math.abs(await centre(e.locator('.bead'))-await centre(e.locator('.target')))).toBeLessThan(2);
  await page.evaluate(()=>window.testSpectrum=null);await expect(e).toHaveAttribute('data-held','true');
  await expect.poll(()=>e.locator('.bead').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(21, 23, 26)');
  await page.locator('#nav-settings').click();await page.locator('#precision').check();
  expect(await e.locator('.reading-detail').evaluate(n=>getComputedStyle(n).clipPath)).toBe('none');
});

test('mobile chrome resists selection and double-tap zoom without disabling pinch, settings remain reachable',async({page},info)=>{
  await fakeMic(page);await page.goto('/');
  for(const size of [{width:360,height:640},{width:430,height:932},{width:932,height:430}]){
    await page.setViewportSize(size);if(await page.locator('#settings').isHidden())await page.locator('#nav-settings').click();
    expect(await page.locator('#settings').evaluate(n=>getComputedStyle(n).userSelect??getComputedStyle(n).webkitUserSelect)).toBe('none');
    expect(await page.locator('#settings').evaluate(n=>getComputedStyle(n).overscrollBehaviorY)).toBe('contain');
    expect(await page.locator('body').evaluate(n=>getComputedStyle(n).touchAction)).toBe('manipulation');
    expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/user-scalable=no|maximum-scale=1/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    await page.locator('#gate').fill('85');await page.locator('#rejection').selectOption('0.75');await page.locator('#precision').check();
    await expect(page.locator('#gate-label')).toHaveText('-85 dB');
    await page.screenshot({path:info.outputPath(`settings-${size.width}.png`)});
  }
});

test('fading measured notes keep moving below the normal gate and expire instead of guessing',async({page})=>{
  await fakeMic(page);await page.goto('/');await page.locator('#listen').click();
  const send=async f=>page.evaluate(f=>{window.testSpectrum=f.bins;window.testLevel=10**(f.rms/20);},{bins:Array.from(f.spectrum),rms:f.rms});
  await send(audioFixture({notes:[[1,-20]],db:-42}));
  const a=page.locator('.string').nth(1);await expect(a).toHaveAttribute('data-state','flat');
  await send(audioFixture({notes:[[1,-15]],db:-72}));await expect(a).toHaveAttribute('data-tracking','true');
  await expect(a.locator('.reading-detail')).toHaveText('↑ 15¢');
  await expect(a).toHaveAttribute('data-state','quiet',{timeout:4000});
  await expect(a).not.toHaveAttribute('data-held','true');
});

test('reduced motion reaches measured position immediately without decorative animation',async({page})=>{
  await fakeMic(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#listen').click();
  await setNotes(page,[[1,-40]]);const a=page.locator('.string').nth(1);await expect(a).toHaveAttribute('data-state','flat');
  await expect.poll(async()=>await centre(a.locator('.bead'))-await centre(a.locator('.target'))).toBeGreaterThan(30);
  expect(await a.locator('.bead').evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
});

test('native audio continues a real decaying stream below the user gate without new permission',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      const context=new AudioContext();await context.resume();
      const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=110*2**(-20/1200);gain.gain.value=10**(-42/20);
      oscillator.connect(gain);gain.connect(destination);oscillator.start();
      window.decayAudio={context,oscillator,gain};return destination.stream;
    }}});
  });
  await page.goto('/');await page.locator('#listen').click();const a=page.locator('.string').nth(1);
  await expect(a).toHaveAttribute('data-state','flat');
  await page.evaluate(()=>decayAudio.gain.gain.setTargetAtTime(10**(-72/20),decayAudio.context.currentTime,.08));
  await expect(a).toHaveAttribute('data-tracking','true');
  await expect(a.locator('.reading-detail')).toHaveText('↑ 20¢');
  await page.evaluate(()=>{decayAudio.gain.gain.cancelScheduledValues(decayAudio.context.currentTime);decayAudio.gain.gain.value=0;});await expect(a).toHaveAttribute('data-state','quiet');
  await page.locator('#listen').click();await page.evaluate(()=>decayAudio.context.close());
});
