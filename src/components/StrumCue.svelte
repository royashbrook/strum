<script lang="ts">
  import { onMount, tick } from 'svelte';
  let { visible, listening }: { visible: boolean; listening: boolean } = $props();
  let element: HTMLDivElement;
  function place() {
    const ear = document.getElementById('listen')?.getBoundingClientRect();
    const room = document.getElementById('instrument')?.getBoundingClientRect();
    if (!element || !ear || !room || document.hidden) return;
    const x = room.x + room.width / 2,
      y = room.y + room.height * 0.46;
    for (const [name, value] of Object.entries({
      earX: ear.x + ear.width / 2 - 16,
      earY: ear.y + ear.height / 2 - 12,
      guitarX: x - 18,
      guitarY: y + 12,
      centreX: x,
      centreY: y,
    }))
      element.style.setProperty('--' + name, value + 'px');
  }
  $effect(() => {
    if (visible) void tick().then(place);
  });
  onMount(() => {
    const observer = new ResizeObserver(place);
    for (const id of ['instrument', 'listen']) {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    }
    place();
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={element}
  id="strum-cue"
  hidden={!visible}
  aria-hidden="true"
  data-stage={listening ? 'strum' : 'tap'}
>
  <span class="cue-guitar"></span><span class="cue-tap"></span><span class="cue-hand"></span>
</div>
