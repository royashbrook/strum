import test from 'node:test';
import assert from 'node:assert/strict';
import {easePitch} from '../src/lib/pitch-motion.ts';
test('pitch glides to the target without a jump or overshoot',()=>{
  const m={value:-40,velocity:0};let last=m.value;
  for(let i=0;i<60;i++){
    const value=easePitch(m,40,1/60);assert.ok(value>=last&&value<=40);assert.ok(value-last<10);last=value;
  }
  assert.ok(Math.abs(m.value-40)<.01);
});
test('retargeting preserves continuous motion, reduced motion snaps and clears velocity',()=>{
  const m={value:0,velocity:0};easePitch(m,40,.016);
  const last=m.value;easePitch(m,-40,.016);assert.ok(Math.abs(m.value-last)<3);
  easePitch(m,-20,.016,true);assert.deepEqual(m,{value:-20,velocity:0});
});
test('frame-rate independent easing and no giant resume step',()=>{
  const a={value:0,velocity:0},b={value:0,velocity:0};
  for(let i=0;i<60;i++)easePitch(a,40,1/60);
  for(let i=0;i<120;i++)easePitch(b,40,1/120);
  assert.ok(Math.abs(a.value-b.value)<1e-8);
  const m={value:0,velocity:0};assert.ok(easePitch(m,80,10)<20);
});
