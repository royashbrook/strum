import test from 'node:test';
import assert from 'node:assert/strict';
import {STRINGS,FFT_SIZE,analyseSpectrum,settings,levelDb} from '../src/lib/analysis.ts';

import { spectrum } from './spectrum.js';
test('bounded settings tolerate missing, malformed and hostile saved values',()=>{assert.deepEqual(settings(null),{gate:-60,rejection:.35});assert.deepEqual(settings({gate:Infinity,rejection:'0'}),settings());assert.deepEqual(settings({gate:-999,rejection:99}),{gate:-85,rejection:1});});
test('silence and sub-gate sounds never produce tuned strings',()=>{assert.equal(levelDb(new Float32Array(100)),-120);assert.ok(analyseSpectrum(spectrum([[0]]),48000,-80).every(s=>s.state==='quiet'));assert.ok(analyseSpectrum(new Float32Array(FFT_SIZE/2).fill(-Infinity),48000,-20).every(s=>s.state==='quiet'));});
for(const rate of [44100,48000])for(let i=0;i<6;i++)for(const cents of [-30,0,30])test(`${rate} Hz: string ${i}, detuned ${cents} cents`,()=>{const result=analyseSpectrum(spectrum([[i,cents]],rate),rate,-20)[i];assert.equal(result.state,cents<0?'flat':cents>0?'sharp':'tuned');assert.ok(Math.abs(result.cents-cents)<1);});
test('low E alone cannot manufacture an independent B or high E',()=>{const rows=analyseSpectrum(spectrum([[0]]),48000,-20);assert.equal(rows[0].state,'tuned');assert.ok(['quiet','uncertain'].includes(rows[4].state));assert.ok(['quiet','uncertain'].includes(rows[5].state));});
test('all-six spectral fixture preserves visible ambiguity rather than declaring victory',()=>{const rows=analyseSpectrum(spectrum(STRINGS.map((_,i)=>[i])),48000,-20);assert.deepEqual(rows.slice(0,4).map(s=>s.state),['tuned','tuned','tuned','tuned']);assert.equal(rows[4].state,'uncertain');assert.equal(rows[5].state,'uncertain');});
test('a clear isolated fundamental can be measured without overtones',()=>{const bins=new Float32Array(FFT_SIZE/2).fill(-120);const index=Math.round(110/48000*FFT_SIZE);bins[index]=-20;assert.equal(analyseSpectrum(bins,48000,-20)[1].state,'tuned');});
