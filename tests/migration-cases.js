// Independently assembled migration scenarios. Synthetic, not microphone recordings.
// Targets come from the pinned installed release, not the implementation under test.
import { FFT_SIZE } from '../src/lib/analysis.ts';
import { audioFixture, sampleFixture } from './waveform.js';

export const HOP = 90;
export function migrationCases({ STRINGS, TUNINGS, tuningFor }) {
  const pluck = [1, 0.5, 0.33, 0.25, 0.2, 0.16];
  const hum = (hz, db) => ({ hz, db, harmonics: 12 });
  const repeat = (spec, n) => Array.from({ length: n }, () => spec);

  const scenarios = [];
  const add = (name, spec) =>
    scenarios.push({ name, tuning: 'standard', profile: 'quiet', ...spec });

  for (const t of TUNINGS)
    for (const rate of [44100, 48000])
      for (let i = 0; i < 6; i++)
        for (const cents of [-30, 0, 30]) {
          add(`${t.id} ${rate} string ${i} ${cents}c`, {
            tuning: t.id,
            rate,
            frames: repeat(
              {
                kind: 'fixture',
                args: {
                  rate,
                  frequencies: [t.strings[i].hz * 2 ** (cents / 1200)],
                  weights: [1, 0.3, 0.12, 0.06, 0.03],
                  noise: -100,
                },
              },
              4,
            ),
          });
        }
  for (const rate of [44100, 48000]) {
    const detune = [-25, 15, 0, -20, 20, -18];
    add(`strum ${rate}`, {
      rate,
      frames: repeat(
        {
          kind: 'fixture',
          args: {
            rate,
            frequencies: STRINGS.map((s, i) => s.hz * 2 ** (detune[i] / 1200)),
            weights: pluck,
            db: -30,
            noise: -95,
          },
        },
        6,
      ),
    });
    add(`weak electric ${rate}`, {
      rate,
      frames: repeat(
        {
          kind: 'fixture',
          args: {
            rate,
            frequencies: [STRINGS[0].hz * 2 ** (-15 / 1200)],
            weights: [0.25, 0.6, 1, 0.8, 0.6, 0.45],
            db: -75,
            noise: -90,
          },
        },
        4,
      ),
    });
    add(`missing fundamental ${rate}`, {
      rate,
      frames: repeat(
        {
          kind: 'fixture',
          args: {
            rate,
            frequencies: [STRINGS[0].hz],
            weights: [0, 0.8, 0.6, 0.4, 0.2, 0.1, 0.1],
            noise: -100,
          },
        },
        4,
      ),
    });
    for (const seed of [1, 7, 913])
      for (const noise of [-55, -70, -75])
        add(`noise ${rate} ${noise} seed ${seed}`, {
          rate,
          frames: repeat({ kind: 'fixture', args: { rate, frequencies: [], noise, seed } }, 4),
        });
    add(`midpoint ${rate}`, {
      rate,
      frames: repeat({ kind: 'fixture', args: { rate, frequencies: [220], weights: [1] } }, 3),
    });
  }
  // the two changes that just shipped, exercised across their state machines
  for (const base of [50, 60])
    for (const rate of [44100, 48000]) {
      add(`hum ${base} alone ${rate}`, {
        rate,
        frames: repeat(
          { kind: 'fixture', args: { rate, frequencies: [], hum: hum(base, -60), noise: -95 } },
          40,
        ),
      });
      add(`hum ${base} then a note ${rate}`, {
        rate,
        frames: [
          ...repeat(
            { kind: 'fixture', args: { rate, frequencies: [], hum: hum(base, -60), noise: -95 } },
            34,
          ),
          ...Array.from({ length: 16 }, (_, i) => ({
            kind: 'fixture',
            args: {
              rate,
              frequencies: [110],
              weights: pluck,
              db: -35 - (3 * i * HOP) / 1000,
              hum: hum(base, -60),
              noise: -95,
            },
          })),
        ],
      });
      add(`hum ${base} starts and stops ${rate}`, {
        rate,
        frames: [
          ...repeat({ kind: 'fixture', args: { rate, frequencies: [], noise: -95 } }, 6),
          ...repeat(
            { kind: 'fixture', args: { rate, frequencies: [], hum: hum(base, -60), noise: -95 } },
            36,
          ),
          ...repeat({ kind: 'fixture', args: { rate, frequencies: [], noise: -95 } }, 6),
        ],
      });
    }
  add('sharp open g chord, no hum', {
    tuning: 'open-g',
    rate: 48000,
    frames: Array.from({ length: 40 }, (_, i) => ({
      kind: 'fixture',
      args: {
        rate: 48000,
        frequencies: tuningFor('open-g').strings.map((s) => s.hz * 2 ** (35 / 1200)),
        weights: [1, 0.6, 0.3, 0.15],
        db: -55 - (i * HOP) / 1000,
        noise: -110,
      },
    })),
  });
  for (const rate of [44100, 48000])
    for (const i of [0, 3, 5])
      for (const cents of [-200, -100, -40, -20, 20, 40, 100, 200]) {
        add(`step ${rate} string ${i} ${cents}c`, {
          rate,
          frames: [0.09, 0.24, 0.5, 0.7].map((dt) => ({
            kind: 'stepped',
            args: { rate, hz: STRINGS[i].hz, cents, at: 1, tEnd: 1 + dt },
          })),
        });
      }
  for (const i of [0, 5]) {
    add(`onset string ${i}`, {
      rate: 48000,
      frames: [0.24, 0.5, 0.7].map((dt) => ({
        kind: 'stepped',
        args: { rate: 48000, hz: STRINGS[i].hz, cents: 0, at: 1, from: 1, tEnd: 1 + dt },
      })),
    });
    add(`offset string ${i}`, {
      rate: 48000,
      frames: [0.09, 0.24].map((dt) => ({
        kind: 'stepped',
        args: { rate: 48000, hz: STRINGS[i].hz, cents: 0, at: 1, to: 1, tEnd: 1 + dt },
      })),
    });
  }
  for (const profile of ['quiet', 'noisy'])
    add(`preset ${profile}`, {
      profile,
      rate: 48000,
      frames: repeat(
        {
          kind: 'fixture',
          args: {
            rate: 48000,
            frequencies: [STRINGS[1].hz * 2 ** (-15 / 1200)],
            weights: pluck,
            db: -45,
            noise: -95,
          },
        },
        4,
      ),
    });
  // Boundary scenarios. The first fixture set had 380 readings within a cent of perfect and 683
  // between 20 and 40 cents off, and almost nothing in between: two readings within a cent of
  // the green edge, none at all between 5 and 6. Two threshold mutants went unseen because of
  // it. These park notes ON each measured edge instead of near it.
  // Measured flip points: green between 4.85c (E2) and 5.10c (E4); ownership unclaimed 29 to 30
  // cents wide around each midpoint; detection down to fixture db -83.5 quiet, -53.5 noisy.
  for (const i of [0, 3, 5])
    for (const c of [4.5, 4.85, 4.95, 5.05, 5.15, 5.5, -4.85, -5.05, -5.5]) {
      add(`green edge string ${i} ${c}c`, {
        rate: 48000,
        frames: repeat(
          {
            kind: 'fixture',
            args: {
              rate: 48000,
              frequencies: [STRINGS[i].hz * 2 ** (c / 1200)],
              weights: pluck,
              db: -40,
            },
          },
          3,
        ),
      });
    }
  for (let i = 0; i < 5; i++) {
    const mid = Math.sqrt(STRINGS[i].hz * STRINGS[i + 1].hz);
    for (const c of [-16, -15, -14.5, -14, 0, 14, 14.5, 15, 16]) {
      add(`ownership midpoint ${i} ${c}c`, {
        rate: 48000,
        frames: repeat(
          {
            kind: 'fixture',
            args: { rate: 48000, frequencies: [mid * 2 ** (c / 1200)], weights: [1], db: -45 },
          },
          3,
        ),
      });
    }
  }
  for (const [profile, edge] of [
    ['quiet', -83.5],
    ['noisy', -53.5],
  ])
    for (const i of [0, 5])
      for (const d of [2, 0.5, 0, -0.5, -2]) {
        add(`detection edge ${profile} string ${i} ${(edge + d).toFixed(1)}dB`, {
          profile,
          rate: 48000,
          frames: repeat(
            {
              kind: 'fixture',
              args: {
                rate: 48000,
                frequencies: [STRINGS[i].hz * 2 ** (-15 / 1200)],
                weights: pluck,
                db: edge + d,
              },
            },
            3,
          ),
        });
      }
  // Prominence. A peak must clear the median of bins 4 to 12 away by 10 + rejection*10 dB,
  // 13.5 at the quiet preset. Raising broadband noise cannot reach that floor, because the noise
  // lifts the local median with the peak; crowding the bins the median actually reads does. The
  // target is repeated to raise it against eight neighbours placed 5 to 11 bins out, and the
  // flip measured at six copies (margin 14.02 dB, read) versus five (under the floor, not read).
  for (const i of [0, 3, 5])
    for (const copies of [4, 5, 6, 7, 9]) {
      const hz = STRINGS[i].hz * 2 ** (-15 / 1200),
        binHz = 48000 / FFT_SIZE;
      const near = [-11, -9, -7, -5, 5, 7, 9, 11].map((d) => hz + d * binHz);
      add(`prominence floor string ${i} x${copies}`, {
        rate: 48000,
        frames: repeat(
          {
            kind: 'fixture',
            args: {
              rate: 48000,
              frequencies: [...Array(copies).fill(hz), ...near],
              weights: [1],
              db: -60,
              seed: 5,
            },
          },
          3,
        ),
      });
    }

  // the refinement only refuses when a tone is weak or moving, so walk a step in fine increments
  for (const cents of [8, 12, 16, 20, 30, 50, 70])
    for (const dt of [0.15, 0.3, 0.45, 0.6]) {
      add(`step fine E4 ${cents}c +${dt}s`, {
        rate: 48000,
        frames: [
          { kind: 'stepped', args: { rate: 48000, hz: STRINGS[5].hz, cents, at: 1, tEnd: 1 + dt } },
        ],
      });
    }

  // a tuning switch mid-sequence must clear evidence but keep the room's hum memory
  scenarios.push({
    name: 'tuning switch mid-sequence',
    tuning: 'standard',
    profile: 'quiet',
    rate: 48000,
    switchAt: 20,
    switchTo: 'open-d',
    frames: repeat(
      {
        kind: 'fixture',
        args: {
          rate: 48000,
          frequencies: [110],
          weights: pluck,
          db: -35,
          hum: hum(60, -60),
          noise: -95,
        },
      },
      40,
    ),
  });

  return scenarios;
}

export function migrationFrame(f) {
  if (f.kind !== 'stepped') return audioFixture({ noise: -95, ...f.args });
  const { rate, hz, cents, at = 1, from = 0, to = 99, tEnd } = f.args;
  const x = new Float32Array(rate * 2);
  let phase = 0.7;
  for (let n = 0; n < x.length; n++) {
    const t = n / rate;
    phase += (2 * Math.PI * hz * 2 ** ((t >= at ? cents : 0) / 1200)) / rate;
    x[n] = t >= from && t <= to ? 0.01 * Math.sin(phase) : 0;
  }
  const end = Math.round(tEnd * rate);
  return sampleFixture(x.slice(end - FFT_SIZE, end), rate);
}
