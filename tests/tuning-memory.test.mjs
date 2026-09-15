import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberTuning } from '../public/tuning-memory.js';
const reading = (state, cents = null) => ({ state, cents, level: 1, confidence: 1 });

test('silence and uncertainty cannot invent a tuned string', () => {
  const memory = [];
  for (const state of ['quiet', 'uncertain', 'quiet']) assert.equal(rememberTuning([reading(state)], memory)[0].state, state);
});
test('only stable tuning latches green; fading and uncertainty preserve that result', () => {
  const memory = [];
  for (let i = 0; i < 2; i++) assert.equal(rememberTuning([reading('tuned', 1)], memory)[0].state, 'checking');
  assert.equal(rememberTuning([reading('tuned', 1)], memory)[0].state, 'tuned');
  for (const state of ['quiet', 'uncertain', 'quiet']) {
    const held = rememberTuning([reading(state, 14)], memory)[0];
    assert.equal(held.state, 'tuned'); assert.equal(held.held, true);
    assert.equal(held.cents, null); assert.equal(held.level, 0);
  }
});
test('a single green flash does not survive silence', () => {
  const memory = [];
  rememberTuning([reading('tuned', 0)], memory);
  assert.equal(rememberTuning([reading('quiet')], memory)[0].state, 'quiet');
  assert.equal(rememberTuning([reading('tuned', 0)], memory)[0].state, 'checking');
});
test('fresh low or high readings immediately clear saved green', () => {
  for (const state of ['flat', 'sharp']) {
    const memory = [];
    for (let i = 0; i < 3; i++) rememberTuning([reading('tuned', 0)], memory);
    const fresh = rememberTuning([reading(state, state === 'flat' ? -12 : 12)], memory)[0];
    assert.equal(fresh.state, state); assert.equal(fresh.held, false);
    assert.equal(rememberTuning([reading('quiet')], memory)[0].state, 'quiet');
  }
});
test('interrupted in-tune frames never accumulate into a saved green', () => {
  for (const interruption of ['quiet', 'uncertain']) {
    const memory = [];
    for (const state of ['tuned', interruption, 'tuned', interruption, 'tuned', interruption]) {
      const result = rememberTuning([reading(state, state === 'tuned' ? 0 : null)], memory)[0];
      assert.notEqual(result.state, 'tuned'); assert.equal(result.held, false);
    }
    for (let i = 0; i < 3; i++) rememberTuning([reading('tuned', 0)], memory);
    assert.equal(rememberTuning([reading('quiet')], memory)[0].held, true);
  }
});
test('six strings can be tuned one at a time; a fresh session starts empty', () => {
  const memory = [];
  for (let string = 0; string < 6; string++) {
    for (let i = 0; i < 3; i++) rememberTuning(Array.from({ length: 6 }, (_, n) => reading(n === string ? 'tuned' : 'quiet', n === string ? 0 : null)), memory);
  }
  const quiet = Array.from({ length: 6 }, () => reading('quiet'));
  assert.ok(rememberTuning(quiet, memory).every(s => s.state === 'tuned' && s.held));
  memory.length = 0;
  assert.ok(rememberTuning(quiet, memory).every(s => s.state === 'quiet' && !s.held));
});
