import {test,expect} from '@playwright/test';
import {fakeMic} from './microphone-fixture.js';

test.use({hasTouch:true,isMobile:true,viewport:{width:430,height:932}});

test('settings resist page movement and double taps while controls and deliberate scroll remain usable',async({page,browserName},info)=>{
  await fakeMic(page);await page.goto('/');await page.locator('#nav-settings').tap();
  const heading=await page.locator('#settings-title').boundingBox();
  await page.touchscreen.tap(heading.x+20,heading.y+10);await page.touchscreen.tap(heading.x+20,heading.y+10);
  await page.waitForTimeout(400);
  expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
  if(browserName==='chromium'){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:24,y:500}]});
    for(const y of [520,550,600,650])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:24,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  }
  await page.evaluate(()=>window.scrollTo(0,300));
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:0});
  await expect(page.locator('#settings')).toBeVisible();
  await page.getByRole('radio',{name:'Noisy room'}).tap();await expect(page.getByRole('radio',{name:'Noisy room'})).toBeChecked();
  await page.screenshot({path:info.outputPath('phone-listening.png')});
  await page.setViewportSize({width:932,height:430});
  for(const name of ['Quiet guitar','Noisy room']){
    const b=await page.getByRole('radio',{name}).boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.y+b.height).toBeLessThan(430);
  }
  await page.locator('#nav-about').tap();
  const before=await page.locator('#about').evaluate(n=>n.scrollTop);
  await page.locator('#about').evaluate(n=>n.scrollBy(0,1000));
  expect(await page.locator('#about').evaluate(n=>n.scrollTop)).toBeGreaterThan(before);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  await expect(page.locator('#listen')).toBeInViewport();
});

test('the touch fallback blocks only stationary background double taps, not controls, swipes or pinch',async({page})=>{
  await page.goto('/');await page.locator('#nav-settings').click();
  const result=await page.evaluate(()=>{
    const background=document.querySelector('#settings-title'),control=document.querySelector('input[value=quiet]');
    const point=(x,y)=>({clientX:x,clientY:y});
    function emit(type,target,touches,changed,at){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed},timeStamp:{value:at}});return target.dispatchEvent(e);}
    function tap(target,at){const p=point(100,200);emit('touchstart',target,[p],[],at);return emit('touchend',target,[],[p],at+50);}
    const first=tap(background,1000),second=tap(background,1150),controlFirst=tap(control,1300),controlSecond=tap(control,1450);
    emit('touchstart',background,[point(100,200)],[],2000);
    const swipe=emit('touchend',background,[],[point(100,300)],2200);
    emit('touchstart',background,[point(100,200),point(200,200)],[],3000);
    const pinch=emit('touchend',background,[point(100,200)],[point(200,200)],3100);
    return {first,second,controlFirst,controlSecond,swipe,pinch,afterPinch:tap(background,3200)};
  });
  expect(result).toEqual({first:true,second:false,controlFirst:true,controlSecond:true,swipe:true,pinch:true,afterPinch:true});
});

test('native analyser hears a faint note below the former spectral floor without adjusting any setting',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      const context=new AudioContext();await context.resume();const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),samples=buffer.getChannelData(0);
      let seed=913;const hz=110*2**(-20/1200);
      for(let i=0;i<samples.length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        samples[i]=Math.sin(2*Math.PI*hz*i/context.sampleRate)*10**(-90/20)+(seed/2**32*2-1)*10**(-75/20);
      }
      const source=context.createBufferSource(),destination=context.createMediaStreamDestination();source.buffer=buffer;source.loop=true;source.connect(destination);source.start();window.quietAudio={context,source};return destination.stream;
    }}});
  });
  await page.goto('/');await page.locator('#listen').tap();const a=page.locator('.string').nth(1);
  await expect(a).toHaveAttribute('data-state','flat');
  await expect(a.locator('.reading-detail')).toHaveText(/↑ (1[7-9]|2[0-3])¢/);
  await expect(page.locator('#strum-cue')).toBeHidden();
  await page.locator('#nav-settings').tap();await expect(page.locator('#input-label')).toHaveText('note found');
  await page.getByRole('radio',{name:'Noisy room'}).tap();await expect(a).toHaveAttribute('data-state','quiet');
  await expect(page.locator('#input-label')).toHaveText('too quiet — move closer');
  await page.getByRole('radio',{name:'Quiet guitar'}).tap();await expect(a).toHaveAttribute('data-state','flat');
  await page.locator('#listen').tap();await page.evaluate(()=>quietAudio.context.close());
});
