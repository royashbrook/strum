import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseSpectrum} from '../public/analysis.js';
import {listeningProfile,listeningProfiles} from '../public/listening.js';
import {audioFixture} from './waveform.js';

test('plain listening presets migrate intent and reject malformed saved choices',()=>{
  assert.equal(listeningProfile(null,null),'quiet');
  assert.equal(listeningProfile('noisy',{gate:-85}),'noisy');
  assert.equal(listeningProfile('bad',{gate:-65,rejection:.99}),'quiet');
  assert.equal(listeningProfile(null,{gate:-35}),'noisy');
  assert.equal(listeningProfile(null,{gate:'-35'}),'quiet');
  assert.equal(listeningProfiles.quiet.gate,-85);
  assert.equal(listeningProfiles.noisy.gate,-55);
});

test('quiet notes below -100 spectral dB remain measurable above local noise',()=>{
  for(const rate of [44100,48000])for(const seed of [913,7811,1234567])for(let i=0;i<6;i++){
    const f=audioFixture({rate,seed,notes:[[i,-20]],db:-90,noise:-75});
    assert.ok(Math.max(...f.spectrum)<-100,'fixture exposes the former peak cutoff');
    const result=analyseSpectrum(f.spectrum,rate,f.rms,listeningProfiles.quiet)[i];
    assert.equal(result.state,'flat',JSON.stringify({rate,seed,i,result}));
    assert.ok(Math.abs(result.cents+20)<3);
    assert.ok(analyseSpectrum(f.spectrum,rate,f.rms,listeningProfiles.noisy).every(s=>s.state==='quiet'));
  }
});

test('quiet preset never promotes broadband noise to a note across extra amplitudes and seeds',()=>{
  for(const rate of [44100,48000])for(const noise of [-55,-70,-80,-90])for(let seed=1;seed<=20;seed++){
    const f=audioFixture({rate,seed,frequencies:[],noise});
    const result=analyseSpectrum(f.spectrum,rate,f.rms,listeningProfiles.quiet);
    assert.ok(result.every(s=>!['flat','sharp','tuned'].includes(s.state)),JSON.stringify({rate,noise,seed,result}));
  }
});
