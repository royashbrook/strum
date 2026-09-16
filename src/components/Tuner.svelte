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
      </div>
    {/each}
  </div>
</div>
