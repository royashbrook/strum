import test from 'node:test';
import assert from 'node:assert/strict';
import {TUNINGS, tuningFor} from '../public/tunings.js';
import {analyseSpectrum} from '../public/analysis.js';
import {followResonance} from '../public/resonance.js';
import {listeningProfiles} from '../public/listening.js';
import {audioFixture} from './waveform.js';

const expected = [
  ['E2','A2','D3','G3','B3','E4'], ['D2','A2','D3','G3','B3','E4'],
  ['D2','A2','D3','F♯3','A3','D4'], ['D2','G2','D3','G3','B3','D4'],
];
const measured = s => ['flat','sharp','tuned'].includes(s.state);
const read = (f,t,profile=listeningProfiles.quiet) => analyseSpectrum(f.spectrum,f.rate,f.rms,{...profile,tuning:t.id});
test('four named, low-to-high presets use concert pitch and invalid storage falls back to Standard',()=>{
  assert.deepEqual(TUNINGS.map(t=>t.name),['Standard','Drop D','Open D','Open G']);
  assert.deepEqual(TUNINGS.map(t=>t.strings.map(s=>s.note+s.octave)),expected);
  assert.ok(Math.abs(tuningFor('drop-d').strings[0].hz-73.41619198)<.000001);
  assert.ok(Math.abs(tuningFor('open-d').strings[3].hz-184.99721136)<.000001);
  assert.ok(Math.abs(tuningFor('open-g').strings[1].hz-97.998859)<.000001);
  for(const bad of [undefined,null,'','unknown','__proto__','constructor',{},12])assert.equal(tuningFor(bad).id,'standard');
});

for(const t of TUNINGS)for(const rate of [44100,48000]){
  test(`${t.name} ${rate}: each physical string measures flat, tuned and sharp`,()=>{
    for(let i=0;i<6;i++)for(const cents of [-30,0,30]){
      const f=audioFixture({rate,frequencies:[t.strings[i].hz*2**(cents/1200)],weights:[1,.3,.12,.06,.03],noise:-100});
      const rows=read(f,t),r=rows[i];
      assert.equal(r.state,cents<0?'flat':cents>0?'sharp':'tuned',JSON.stringify({i,cents,rows}));
      assert.ok(Math.abs(r.cents-cents)<2);
      assert.ok(rows.every((s,j)=>j===i||!measured(s)),'one pluck must not manufacture other strings');
    }
  });
  test(`${t.name} ${rate}: standard-to-preset retuning reports the correct direction before arrival`,()=>{
    const standard=tuningFor('standard');
    for(let i=0;i<6;i++){
      const start=1200*Math.log2(standard.strings[i].hz/t.strings[i].hz);
      for(const cents of [start,start/2,0]){
        const f=audioFixture({rate,frequencies:[t.strings[i].hz*2**(cents/1200)]});
        const r=read(f,t)[i];
        assert.equal(r.state,cents>5?'sharp':'tuned',JSON.stringify({i,cents,r}));
        assert.ok(Math.abs(r.cents-cents)<2);
      }
    }
  });
  test(`${t.name} ${rate}: quiet fundamentals remain readable and broadband noise stays unconfirmed`,()=>{
    for(let i=0;i<6;i++){
      const f=audioFixture({rate,frequencies:[t.strings[i].hz*2**(-20/1200)],weights:[1],db:-90,noise:-75,seed:913});
      assert.equal(read(f,t)[i].state,'flat',`quiet string ${i}`);
    }
    for(const noise of [-55,-75])for(let seed=1;seed<=40;seed++){
      const f=audioFixture({rate,frequencies:[],noise,seed});
      assert.ok(read(f,t).every(s=>!measured(s)),JSON.stringify({noise,seed}));
    }
  });
}
test('open-tuning octave collisions stay ambiguous in a full strum, not falsely all green',()=>{
  for(const t of TUNINGS.slice(1)){
    const f=audioFixture({frequencies:t.strings.map(s=>s.hz),weights:[1,.8,.6,.4,.2]});
    const r=read(f,t);
    assert.equal(r[0].state,'tuned');assert.equal(r[2].state,'uncertain');
    if(t.id.startsWith('open'))assert.equal(r[5].state,'uncertain');
  }
});
test('fading evidence cannot cross a tuning switch, even for an unchanged A string',()=>{
  const history=[],loud=audioFixture({frequencies:[110],db:-42,noise:-110}),faint=audioFixture({frequencies:[110],db:-68,noise:-110});
  const config={gate:-60,rejection:.35,tuning:'standard'};
  const r=(f,options,time)=>followResonance(f.spectrum,f.rate,f.rms,options,history,time);
  assert.equal(r(loud,config,0)[1].state,'tuned');
  assert.equal(r(faint,config,90)[1].tracking,true);
  assert.equal(r(faint,{...config,tuning:'open-d'},180)[1].state,'quiet');
  assert.equal(r(loud,{...config,tuning:'open-d'},270)[1].state,'tuned');
  assert.equal(r(faint,{...config,tuning:'open-d'},360)[1].tracking,true);
});
test('a pitch midway between neighbouring targets is not assigned to an arbitrary string',()=>{
  const t=tuningFor('standard');
  for(const cents of [-5,0,5]){
    const f=audioFixture({frequencies:[220*2**(cents/1200)],weights:[1]});
    assert.ok(read(f,t).every(s=>!measured(s)));
  }
});
test('missing bass fundamentals do not invent upper-string readings in alternate tunings',()=>{
  for(const t of TUNINGS)for(const rate of [44100,48000])for(const i of [0,1]){
    const f=audioFixture({rate,frequencies:[t.strings[i].hz],weights:[0,.8,.6,.4,.2,.1,.1],noise:-100});
    const rows=read(f,t);
    assert.ok(rows.every(s=>!measured(s)),JSON.stringify({t:t.id,rate,i,rows}));
  }
});
