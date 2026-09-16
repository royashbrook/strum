// CSS owns scrolling and pinch zoom. This narrow fallback only suppresses a
// second stationary tap on non-controls, where iOS can still smart-zoom text.
export function containTaps(root: HTMLElement) {
  type Tap = { x: number; y: number; at: number };
  let start: Tap | null = null,
    previous: Tap | null = null;
  const control = (target: EventTarget | null) =>
    target instanceof Element && target.closest('button,input,select,a,summary,label');
  const abort = new AbortController(),
    signal = abort.signal;
  root.addEventListener('dblclick', (event) => event.preventDefault(), { signal });
  root.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) {
        start = previous = null;
        return;
      }
      const t = event.touches[0];
      start = { x: t.clientX, y: t.clientY, at: event.timeStamp };
    },
    { passive: true, signal },
  );
  root.addEventListener(
    'touchcancel',
    () => {
      start = previous = null;
    },
    { passive: true, signal },
  );
  root.addEventListener(
    'touchend',
    (event) => {
      const t = event.changedTouches[0];
      if (
        !start ||
        !t ||
        event.touches.length ||
        event.timeStamp - start.at > 350 ||
        Math.hypot(t.clientX - start.x, t.clientY - start.y) > 20 ||
        control(event.target)
      ) {
        start = previous = null;
        return;
      }
      if (
        previous &&
        event.timeStamp - previous.at < 350 &&
        Math.hypot(t.clientX - previous.x, t.clientY - previous.y) < 24
      )
        event.preventDefault();
      previous = { x: t.clientX, y: t.clientY, at: event.timeStamp };
      start = null;
    },
    { passive: false, signal },
  );
  return { destroy: () => abort.abort() };
}
