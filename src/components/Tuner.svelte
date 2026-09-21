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
  let node = $state(Array.from({ length: 6 }, () => ({ x: 0.5, o: 0 })));
  const wave = Array.from({ length: 6 }, () => ({ amp: 0, pluck: 0.2, strength: 0, bloom: 0 }));

  function samplePath(amp: number, pluck: number, phase: number) {
    const N = 28,
      p = Math.min(0.98, Math.max(0.02, pluck));
    let d = '';
    for (let k = 0; k <= N; k++) {
      const u = k / N,
        // Triangle envelope peaked at the pluck point: the string's own plucked shape.
        env = u < p ? u / p : (1 - u) / (1 - p),
        y = 12 - amp * 9 * env * Math.sin(2 * Math.PI * 1.5 * u + phase);
      d += `${k ? 'L' : 'M'}${(u * 100).toFixed(1)} ${y.toFixed(2)}`;
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
      const phase = reduced ? 0 : (time / 1000) * 7;
      let sounding = false;
      const dArr = waveD.slice(),
        nArr = node.map((n) => ({ ...n }));
      next.forEach((s, i) => {
        const w = wave[i];
        const measured = s.state === 'flat' || s.state === 'sharp' || s.state === 'tuned';
        if (measured) {
          if (w.amp < 0.05) w.bloom = 1; // fresh attack
          w.pluck += ((s.pluck ?? w.pluck) - w.pluck) * Math.min(1, dt * 6);
        }
        w.strength += ((measured ? (s.pluckStrength ?? 0) : 0) - w.strength) * Math.min(1, dt * 4);
        const targetAmp = measured ? Math.max(0.2, s.level ?? 0) : 0;
        w.amp += (targetAmp - w.amp) * Math.min(1, dt * (targetAmp > w.amp ? 12 : 3));
        w.bloom = Math.max(0, w.bloom - dt * 2);
        if (w.amp > 0.02) sounding = true;
        dArr[i] = samplePath(w.amp, w.pluck, phase);
        nArr[i] = { x: w.pluck, o: Math.min(1, w.amp * 1.6) * (0.4 + 0.6 * w.bloom) * w.strength };
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
        <svg
          class="string-line"
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-lit={String(node[i].o > 0.02)}
        >
          <path class="wave" d={waveD[i]} style:opacity={0.25 + 0.75 * Math.min(1, node[i].o)} />
          <circle
            class="pluck-node"
            cx={node[i].x * 100}
            cy="12"
            r={2.2 + 2.6 * node[i].o}
            style:opacity={node[i].o}
          />
        </svg>
      </div>
    {/each}
  </div>
</div>

<style>
  .string-line {
    display: block;
    width: 100%;
    height: 1.4rem;
    margin-top: 0.15rem;
    overflow: visible;
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
  .string-line .pluck-node {
    fill: var(--accent, #3ddc84);
    filter: drop-shadow(0 0 3px var(--accent, #3ddc84));
  }
  /* Lit strings glow toward the accent; a resting string is the faint baseline. */
  .string-line[data-lit='true'] .wave {
    stroke: color-mix(in srgb, var(--accent, #3ddc84) 55%, var(--ink, #eceef0));
  }
  :global(.string[data-state='tuned']) .string-line .pluck-node {
    fill: var(--accent, #3ddc84);
  }
  @media (prefers-reduced-motion: reduce) {
    .string-line .wave {
      transition: none;
    }
  }
</style>
