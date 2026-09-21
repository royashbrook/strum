<script lang="ts">
  import { onMount } from 'svelte';
  import { easePitch } from '../lib/pitch-motion.ts';
  import type { DisplayReading, Motion } from '../lib/types.ts';

  let {
    readings,
    active,
    precision,
    status,
    reset,
  }: {
    readings: DisplayReading[];
    active: boolean;
    precision: boolean;
    status: string;
    reset: number;
  } = $props();
  let reduced = $state(false);
  let hidden = $state(false);
  let positions = $state<number[]>([0, 0, 0, 0, 0, 0]);
  const motion: Motion[] = Array.from({ length: 6 }, () => ({ value: 0, velocity: 0 }));
  let lastReset = -1;
  const labels = {
    quiet: '·',
    uncertain: '?',
    checking: '…',
    tuned: 'tuned',
    flat: 'low',
    sharp: 'high',
  };

  function detail(s: DisplayReading) {
    if (s.held) return 'last ✓';
    if (s.state === 'tuned') return `✓ ${Math.round(s.cents ?? 0)}¢`;
    return s.state === 'flat' || s.state === 'sharp'
      ? `${(s.cents ?? 0) < 0 ? '↑' : '↓'} ${Math.abs(Math.round(s.cents ?? 0))}¢`
      : '';
  }
  function description(s: DisplayReading) {
    const state = s.held
      ? 'in tune when last heard'
      : s.state === 'flat'
        ? 'low, tighten gently'
        : s.state === 'sharp'
          ? 'high, loosen gently'
          : s.state;
    const cents =
      s.state === 'flat' || s.state === 'sharp'
        ? `, ${Math.abs(Math.round(s.cents ?? 0))} cents`
        : '';
    return `${s.note}${s.octave}: ${state}${cents}`;
  }

  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reduced = media.matches;
      hidden = document.hidden;
    };
    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  });

  $effect(() => {
    const next = readings,
      instant = reduced;
    if (reset !== lastReset) {
      lastReset = reset;
      motion.forEach((m) => {
        m.value = 0;
        m.velocity = 0;
      });
      positions = [0, 0, 0, 0, 0, 0];
    }
    if (!active || hidden) return;
    const targets = next.map((s, i) =>
      s.state === 'tuned'
        ? 0
        : ['flat', 'sharp', 'checking'].includes(s.state)
          ? Math.max(-80, Math.min(80, s.cents ?? 0))
          : motion[i].value,
    );
    let frame = 0,
      previous = 0;
    const draw = (time: number) => {
      const dt = previous ? (time - previous) / 1000 : 0;
      previous = time;
      positions = motion.map((m, i) => easePitch(m, targets[i], dt, instant));
      // Once the spring rests, no animation frames or DOM writes until new evidence.
      if (
        !instant &&
        motion.some((m, i) => Math.abs(m.value - targets[i]) > 0.01 || Math.abs(m.velocity) > 0.01)
      )
        frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });

  // --- pluck-location string lines (spike) ---------------------------------
  // ANY sounding string wiggles (amplitude from its level); the pluck NODE's brightness
  // rides the comb strength, so a weak/ambiguous pluck fades the node without hiding the
  // wiggle. That split also makes the spike self-diagnosing: a wiggle with no node means
  // the estimator, not the render, came up short.
  let waveD = $state<string[]>(Array(6).fill(''));
  let node = $state(Array.from({ length: 6 }, () => ({ y: 0.8, o: 0, spark: 0 })));
  const wave = Array.from({ length: 6 }, () => ({
    amp: 0,
    pluck: 0.2, // LOCKED on the attack, held until the string rests (never tracked live)
    strength: 0,
    spark: 0,
    partials: [1, 0, 0, 0, 0, 0] as number[],
  }));

  // The string runs VERTICALLY down the pitch lane (bridge at the bottom, nut at the top).
  // Its shape is the sum of its own measured modes, partial n as sin(n*pi*v) swinging at n
  // times the base rate, so a bright string looks jagged and a dull one looks like a bow,
  // and the pluck comb sculpts it for free. Base rate scales with the string's pitch so a
  // low E sways slower than a high E. viewBox is 24 wide (centre x=12) by 100 tall.
  function samplePath(amp: number, partials: number[], hz: number, t: number) {
    const N = 32,
      rate = 2.2 * Math.sqrt(hz / 110),
      norm = partials.reduce((a, b) => a + b, 0) || 1;
    let d = '';
    for (let k = 0; k <= N; k++) {
      const v = k / N;
      let y = 0;
      partials.forEach((a, j) => {
        const n = j + 1;
        y += (a / norm) * Math.sin(n * Math.PI * v) * Math.cos(n * rate * t + n * 0.9);
      });
      const x = 12 + amp * 12 * y;
      d += `${k ? 'L' : 'M'}${x.toFixed(2)} ${(v * 100).toFixed(1)}`;
    }
    return d;
  }

  $effect(() => {
    const next = readings;
    if (!active || hidden) return;
    let frame = 0,
      previous = 0;
    const step = (time: number) => {
      const dt = previous ? Math.min(0.05, (time - previous) / 1000) : 0;
      previous = time;
      const t = reduced ? 0 : time / 1000;
      let sounding = false;
      const dArr = waveD.slice(),
        nArr = node.map((n) => ({ ...n }));
      next.forEach((s, i) => {
        const w = wave[i];
        // A held reading is the memory of a note that already died, not sound.
        const measured =
          !s.held && (s.state === 'flat' || s.state === 'sharp' || s.state === 'tuned');
        if (measured) {
          // ATTACK: the string was at rest and now sounds. Lock the pluck point from this
          // first read and fire the sparkle. It stays put until the string rests again;
          // the live estimate keeps drifting as harmonics decay and we ignore that.
          if (w.amp < 0.05) {
            w.pluck = s.pluck ?? 0.2;
            w.strength = Math.max(0.3, s.pluckStrength ?? 0);
            w.spark = 1;
          }
          const p = s.partials ?? w.partials;
          w.partials = w.partials.map((a, j) => a + ((p[j] ?? 0) - a) * Math.min(1, dt * 8));
        }
        const targetAmp = measured ? Math.max(0.2, s.level ?? 0) : 0;
        w.amp += (targetAmp - w.amp) * Math.min(1, dt * (targetAmp > w.amp ? 12 : 3));
        // Come fully to rest, so the last frame is a straight line and the next note is a
        // clean attack (which re-locks the pluck mark).
        if (targetAmp === 0 && w.amp <= 0.02) w.amp = 0;
        w.spark = Math.max(0, w.spark - dt * 1.6);
        // Keep animating while there is anywhere to go, not only once we have moved: the
        // first frame has dt=0, so an amp-only check stopped the loop before it started.
        if (targetAmp > 0 || w.amp > 0.02) sounding = true;
        dArr[i] = samplePath(w.amp, w.partials, s.hz, t);
        nArr[i] = {
          y: 1 - w.pluck,
          o: w.amp > 0.02 ? w.strength * Math.min(1, w.amp * 1.6) : 0,
          spark: w.spark,
        };
      });
      waveD = dArr;
      node = nArr;
      if (sounding) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="intro">
  <h2>six strings. one strum.</h2>
  <p id="status" role="status">{status}</p>
</div>
<div id="instrument" class:precision>
  <div class="landing-line" aria-hidden="true"></div>
  <div id="readings" aria-label="String tuning readings">
    {#each readings as s, i}
      <div
        class="string"
        role="group"
        aria-label={description(s)}
        data-state={s.state}
        data-held={String(!!s.held)}
        data-tracking={String(!!s.tracking)}
        data-settled={String(Math.abs(positions[i]) < 3)}
      >
        <div class="pitch-lane" aria-hidden="true">
          <span class="rail"></span><span class="target"></span>
          <svg
            class="string-line"
            viewBox="0 0 24 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            data-lit={String(node[i].o > 0.02)}
          >
            <path class="wave" d={waveD[i]} style:opacity={0.3 + 0.7 * Math.min(1, node[i].o)} />
            <!-- pluck mark: a small tick at the locked height, plus a sparkle that
                 flares on the attack and dies down, no round glow -->
            <g
              class="pluck-node"
              transform={`translate(12 ${(node[i].y * 100).toFixed(1)})`}
              style:opacity={node[i].o}
            >
              <line class="tick" x1="-3.2" x2="3.2" y1="0" y2="0" />
              <g class="sparkle" style:opacity={node[i].spark}>
                {#each [0, 60, 120, 180, 240, 300] as deg}
                  <line
                    x1="0"
                    y1={-(1.2 + 4.5 * node[i].spark)}
                    x2="0"
                    y2={-(0.4 + 1.5 * node[i].spark)}
                    transform={`rotate(${deg})`}
                  />
                {/each}
              </g>
            </g>
          </svg>
          <span class="pitch-position" style:transform={`translateY(${-positions[i] * 0.48}%)`}>
            <span class="bead"
              ><span class="direction"
                >{s.state === 'flat'
                  ? '↑'
                  : s.state === 'sharp'
                    ? '↓'
                    : s.state === 'uncertain'
                      ? '·'
                      : ''}</span
              ><span class="thumb"></span></span
            >
          </span>
        </div>
        <div class="note-label">
          <span class="note">{s.note}<span class="octave">{s.octave}</span></span><span
            class="reading">{labels[s.state]}</span
          ><span class="reading-detail">{detail(s)}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .string-line {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    color: var(--line, #8a8f98);
  }
  .string-line .wave {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.1;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    transition: stroke 0.3s ease;
  }
  .string-line .pluck-node line {
    stroke: var(--accent, #3ddc84);
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .string-line .pluck-node .tick {
    stroke-width: 2.2;
  }
  .string-line .sparkle line {
    stroke-width: 1.3;
  }
  /* Lit strings glow toward the accent; a resting string is the faint baseline. */
  .string-line[data-lit='true'] .wave {
    stroke: color-mix(in srgb, var(--accent, #3ddc84) 55%, var(--ink, #eceef0));
  }
  @media (prefers-reduced-motion: reduce) {
    .string-line .wave {
      transition: none;
    }
  }
</style>
