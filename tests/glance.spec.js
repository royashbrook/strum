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
    expect(await page.locator('#settings').evaluate(n=>getComputedStyle(n).overscrollBehaviorY)).toBe('none');
    expect(await page.locator('body').evaluate(n=>getComputedStyle(n).position)).toBe('fixed');
    expect(await page.locator('html').evaluate(n=>getComputedStyle(n).overflowY)).toBe('hidden');
    expect(await page.locator('body').evaluate(n=>getComputedStyle(n).touchAction)).toBe('manipulation');
    expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/user-scalable=no|maximum-scale=1/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    await page.getByRole('radio',{name:'Quiet guitar'}).check();await page.locator('#precision').check();
    await expect(page.locator('#threshold')).toHaveText('-85 dB');
    await page.screenshot({path:info.outputPath(`settings-${size.width}.png`)});
  }
});

test('fading measured notes keep moving below the normal gate and expire instead of guessing',async({page})=>{
  await fakeMic(page);await page.goto('/');await page.locator('#nav-settings').click();await page.getByRole('radio',{name:'Noisy room'}).check();await page.locator('#listen').click();
  const send=async f=>page.evaluate(f=>{window.testSpectrum=f.bins;window.testLevel=10**(f.rms/20);},{bins:Array.from(f.spectrum),rms:f.rms});
  await send(audioFixture({notes:[[1,-20]],db:-42}));
  const a=page.locator('.string').nth(1);await expect(a).toHaveAttribute('data-state','flat');
  const faint=audioFixture({notes:[[1,-15]],db:-68});expect(faint.rms).toBeLessThan(-55);expect(faint.rms).toBeGreaterThan(-73);
  await send(faint);await expect(a).toHaveAttribute('data-tracking','true');
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
  await page.goto('/');await page.locator('#nav-settings').click();await page.getByRole('radio',{name:'Noisy room'}).check();await page.locator('#listen').click();const a=page.locator('.string').nth(1);
  await expect(a).toHaveAttribute('data-state','flat');
  await expect(a.locator('.reading-detail')).toHaveText('↑ 20¢');
  // Sine RMS is 3 dB below peak gain. Read each settled level in the page,
  // without assertion polling consuming the 2500 ms continuation window.
  // The second refusal must be the -73 dB floor, not expired history.
  const readings=await page.evaluate(async()=>{
    const string=document.querySelectorAll('.string')[1],meter=document.querySelector('#input-db');
    const started=performance.now(),readings=[];
    for(const [peak,db,detail] of [[-68,'-71 dB','↑ 20¢'],[-78,'-81 dB',null]]){
      decayAudio.gain.gain.setTargetAtTime(10**(peak/20),decayAudio.context.currentTime,.01);
      while((meter.textContent!==db||(detail&&string.querySelector('.reading-detail').textContent!==detail))&&performance.now()-started<2000)
        await new Promise(requestAnimationFrame);
      readings.push({db:meter.textContent,state:string.dataset.state,tracking:string.dataset.tracking,
        detail:string.querySelector('.reading-detail').textContent,elapsed:performance.now()-started});
    }
    return readings;
  });
  expect(readings[0],JSON.stringify(readings)).toMatchObject({db:'-71 dB',state:'flat',tracking:'true',detail:'↑ 20¢'});
  expect(readings[1],JSON.stringify(readings)).toMatchObject({db:'-81 dB',state:'quiet',tracking:'false'});
  expect(readings[1].elapsed).toBeLessThan(2000);
  await page.evaluate(()=>{decayAudio.gain.gain.cancelScheduledValues(decayAudio.context.currentTime);decayAudio.gain.gain.value=0;});await expect(a).toHaveAttribute('data-state','quiet');
  await page.locator('#listen').click();await page.evaluate(()=>decayAudio.context.close());
});
