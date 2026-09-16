import test from 'node:test';
import assert from 'node:assert/strict';
import { followResonance, createHistory } from '../src/lib/resonance.ts';
import { audioFixture } from './waveform.js';
import { filteredPluck } from './filtered-pluck.js';
const config = {gate:-60,rejection:.6};
const read = (f,h,t,c=config) => followResonance(f.spectrum,f.rate,f.rms,c,h,t);
const note = (i,cents=0,db=-42,rate=48000) => audioFixture({rate,notes:[[i,cents]],db,noise:-110});

for (const rate of [44100,48000]) for (let i=0;i<6;i++) test(`${rate}: string ${i} follows real fading pitch, not the expected target`,()=>{
  const h=createHistory();assert.equal(read(note(i,-20,-42,rate),h,0)[i].state,'flat');
  for (const [time,db,cents] of [[90,-62,-19],[180,-68,-17],[270,-72,-12]]) {
    const r=read(note(i,cents,db,rate),h,time)[i];
    assert.equal(r.state,'flat');assert.equal(r.tracking,true);assert.ok(Math.abs(r.cents-cents)<2);
  }
});
test('faint notes cannot start tracks or acquire an unrelated string',()=>{
  const h=createHistory();assert.equal(read(note(1,0,-72),h,0)[1].state,'quiet');
  read(note(1),h,90);assert.equal(read(note(2,0,-72),h,180)[2].state,'quiet');
});
test('gap, absolute lifetime, backwards clock, gate floor and drift terminate weak tracking',()=>{
  for(const mode of ['gap','lifetime','clock','floor','drift']) {
    const h=createHistory();read(note(1,-20),h,1000);
    if(mode==='lifetime')for(let t=1090;t<=3430;t+=90)assert.equal(read(note(1,-20,-72),h,t)[1].tracking,true);
    const time=mode==='gap'?1400:mode==='lifetime'?3520:mode==='clock'?900:1090;
    const r=read(note(1,mode==='drift'?0:-20,mode==='floor'?-84:-72),h,time)[1];
    assert.equal(r.state,'quiet',mode);assert.notEqual(r.tracking,true,mode);
  }
});
test('weak frames cannot incrementally walk away from their acquired pitch',()=>{
  const h=createHistory();read(note(1,-30),h,0);
  assert.equal(read(note(1,-20,-72),h,90)[1].tracking,true);
  assert.equal(read(note(1,-10,-72),h,180)[1].state,'quiet');
});
test('maximum sensitivity still respects its -85 dB floor',()=>{
  const h=createHistory(),c={...config,gate:-85};read(note(1),h,0,c);
  assert.equal(read(note(1,0,-92),h,90,c)[1].state,'quiet');
});
test('acquired notes do not lend confidence to noise, silence or filtered-low-E ghosts',()=>{
  for (const seed of [31,62,93]) {
    const h=createHistory();for(let i=0;i<6;i++)read(note(i),h,i*90);
    for(const db of [-64,-70,-76]) {
      const f=audioFixture({frequencies:[],noise:db,seed});
      assert.ok(read(f,h,600).every(s=>!s.tracking));
    }
    const silence=audioFixture({frequencies:[],noise:-120});
    assert.ok(read(silence,h,690).every(s=>s.state==='quiet'));
    const f=filteredPluck({seed});
    assert.ok(!['tuned','flat','sharp'].includes(read(f,h,700)[4].state));
  }
});
