export interface PwaState {
  status: string;
  notice: boolean;
  checking: boolean;
  applying: boolean;
  available: boolean;
  installable: boolean;
  coach: boolean;
  installHint: boolean;
}
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}
export const initialPwaState = (): PwaState => ({
  status: '',
  notice: false,
  checking: false,
  applying: false,
  available: true,
  installable: false,
  coach: false,
  installHint: false,
});

// One mounted app owns the listeners and polling. Native waiting-worker state is the
// update signal; no framework remount or background callback may reload mid-strum.
export function startPwa(publish: (state: PwaState) => void, beforeUpdate: () => void) {
  const state = initialPwaState(),
    abort = new AbortController(),
    signal = abort.signal;
  const boot = document.querySelector<HTMLMetaElement>('meta[name="strum-build"]')!.content;
  let registration: ServiceWorkerRegistration | undefined,
    dismissed = false,
    disposed = false;
  let prompt: InstallPrompt | undefined;
  const update = (delta: Partial<PwaState>) => {
    if (!disposed) {
      Object.assign(state, delta);
      publish({ ...state });
    }
  };
  function workerBuild(worker: ServiceWorker | null) {
    return new Promise<string | undefined>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        channel.port1.close();
        reject(new Error('No worker response'));
      }, 4000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data?.build);
      };
      worker?.postMessage({ type: 'VERSION' }, [channel.port2]);
    });
  }
  const ready = () =>
    update({ notice: !dismissed, status: 'Update downloaded. Ready when you are.' });
  async function offerWaiting(worker: ServiceWorker) {
    const id = await workerBuild(worker);
    if (id && /^[a-f0-9]{12}$/.test(id) && id !== boot) ready();
    else update({ status: 'Saved for offline use.' });
  }
  const watch = (worker: ServiceWorker | null) => {
    worker?.addEventListener(
      'statechange',
      () => {
        if (worker.state === 'installed') {
          if (registration?.waiting) void offerWaiting(registration.waiting).catch(() => {});
          else update({ status: 'Saved for offline use.' });
        } else if (worker.state === 'redundant')
          update({ status: 'Download failed. Try checking again when online.' });
      },
      { signal },
    );
  };
  async function check() {
    if (disposed || state.checking || !registration || document.hidden) return;
    update({ checking: true, status: 'Checking…' });
    try {
      const response = await fetch('/version.json?update-probe=' + Date.now(), {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Offline');
      const latest = await response.json();
      if (!/^[a-f0-9]{12}$/.test(latest.build)) throw new Error('Invalid version');
      await registration.update();
      if (registration.waiting) await offerWaiting(registration.waiting);
      else if (registration.installing) update({ status: 'Downloading update…' });
      else {
        const active = await workerBuild(registration.active);
        if (active === latest.build && active !== boot) ready();
        else update({ status: 'You’re up to date.' });
      }
    } catch {
      update({
        status: 'Could not check. Your installed version still works; try again when online.',
      });
    } finally {
      update({ checking: false });
    }
  }
  let interval: ReturnType<typeof setInterval> | undefined;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (state.applying) location.reload();
        else void check();
      },
      { signal },
    );
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (disposed) return;
        registration = reg;
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing), { signal });
        if (reg.waiting) void offerWaiting(reg.waiting).catch(() => {});
        void check();
      })
      .catch(() =>
        update({
          status: 'Offline installation unavailable. The tuner still works online.',
          available: false,
        }),
      );
    interval = setInterval(check, 60_000);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) void check();
      },
      { signal },
    );
    addEventListener('online', check, { signal });
    addEventListener('pageshow', check, { signal });
  } else
    update({ status: 'This browser does not support offline installation.', available: false });

  const installed = () =>
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let installDismissed = false;
  try {
    installDismissed = localStorage.getItem('strum.install-tip.dismissed') === 'yes';
  } catch {
    /* In-memory dismissal still works. */
  }
  function offerInstall() {
    if (!installed()) update({ installable: true, coach: !installDismissed });
  }
  if (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
    offerInstall();
  addEventListener(
    'beforeinstallprompt',
    (event) => {
      event.preventDefault();
      prompt = event as InstallPrompt;
      offerInstall();
    },
    { signal },
  );
  addEventListener(
    'appinstalled',
    () => {
      prompt = undefined;
      update({ installable: false, coach: false, installHint: false });
    },
    { signal },
  );

  return {
    check: () => {
      dismissed = false;
      return check();
    },
    later: () => {
      dismissed = true;
      update({ notice: false });
    },
    apply: () => {
      beforeUpdate();
      update({ applying: true });
      if (registration?.waiting) registration.waiting.postMessage({ type: 'ACTIVATE' });
      else location.reload();
    },
    hideCoach: () => update({ coach: false }),
    dismissInstall: () => {
      installDismissed = true;
      update({ coach: false });
      try {
        localStorage.setItem('strum.install-tip.dismissed', 'yes');
      } catch {
        /* Optional preference. */
      }
    },
    install: async () => {
      if (!prompt) {
        update({ installHint: true });
        return;
      }
      const offered = prompt;
      prompt = undefined;
      await offered.prompt();
      await offered.userChoice;
      update({ installable: false, coach: false });
    },
    destroy: () => {
      disposed = true;
      abort.abort();
      clearInterval(interval);
    },
  };
}
