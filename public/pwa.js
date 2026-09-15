// Native service-worker waiting state is the update signal: never reload mid-strum.
export function wirePwa(beforeUpdate) {
  const $ = id => document.getElementById(id), status = $('update-status');
  const boot = document.querySelector('meta[name="strum-build"]').content;
  let registration, applying = false, checking = false, dismissed = false;
  function workerBuild(worker) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('No worker response')); }, 4000);
      channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data?.build); };
      worker?.postMessage({ type: 'VERSION' }, [channel.port2]);
    });
  }
  const ready = () => { $('update-notice').hidden = dismissed; status.textContent = 'Update downloaded. Ready when you are.'; };
  async function offerWaiting(worker) {
    // WebKit can briefly report its first installed worker as both waiting and
    // controlling. Compare build identities, not the timing of those properties.
    const id = await workerBuild(worker);
    if (/^[a-f0-9]{12}$/.test(id) && id !== boot) ready();
    else status.textContent = 'Saved for offline use.';
  }
  const watch = worker => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (registration.waiting) void offerWaiting(registration.waiting).catch(() => {});
        else status.textContent = 'Saved for offline use.';
      } else if (worker.state === 'redundant') status.textContent = 'Download failed. Try checking again when online.';
    });
  };
  async function check() {
    if (checking || !registration || document.hidden) return;
    checking = true; $('check-update').disabled = true;
    status.textContent = 'Checking…';
    try {
      const receipt = await fetch('/version.json?update-probe=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!receipt.ok) throw new Error('Offline');
      const latest = await receipt.json();
      if (!/^[a-f0-9]{12}$/.test(latest.build)) throw new Error('Invalid version');
      await registration.update();
      if (registration.waiting) await offerWaiting(registration.waiting);
      else if (registration.installing) status.textContent = 'Downloading update…';
      else {
        // Another open tab may already have activated the new worker.
        const active = await workerBuild(registration.active);
        if (active === latest.build && active !== boot) ready();
        else status.textContent = 'You’re up to date.';
      }
    } catch { status.textContent = 'Could not check. Your installed version still works; try again when online.'; }
    finally { checking = false; $('check-update').disabled = false; }
  }
  $('check-update').onclick = () => { dismissed = false; void check(); };
  $('later-update').onclick = () => { dismissed = true; $('update-notice').hidden = true; };
  $('apply-update').onclick = () => {
    beforeUpdate(); applying = true;
    $('apply-update').disabled = true; $('apply-update').textContent = 'updating…';
    if (registration?.waiting) registration.waiting.postMessage({ type: 'ACTIVATE' });
    else location.reload();
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applying) location.reload();
      else void check();
    });
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      registration = reg; watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      if (reg.waiting) void offerWaiting(reg.waiting).catch(() => {});
      void check();
    }).catch(() => { status.textContent = 'Offline installation unavailable. The tuner still works online.'; $('check-update').disabled = true; });
    setInterval(check, 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
    addEventListener('online', check);
    addEventListener('pageshow', check);
  } else { status.textContent = 'This browser does not support offline installation.'; $('check-update').disabled = true; }

  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let prompt;
  let installDismissed=false;try{installDismissed=localStorage.getItem('strum.install-tip.dismissed')==='yes';}catch{}
  function offerInstall(){if(installed())return;$('install').hidden=false;$('install-coach').hidden=installDismissed||!$('about').hidden;}
  $('dismiss-install').onclick=()=>{installDismissed=true;$('install-coach').hidden=true;try{localStorage.setItem('strum.install-tip.dismissed','yes');}catch{}};
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) offerInstall();
  addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; offerInstall(); });
  $('install').onclick = async () => {
    if (!prompt) { $('install-hint').hidden = false; return; }
    const offered = prompt; prompt = null;
    await offered.prompt(); await offered.userChoice;
    $('install').hidden = true;$('install-coach').hidden = true;
  };
  addEventListener('appinstalled', () => { prompt = null; $('install').hidden = true; $('install-hint').hidden = true;$('install-coach').hidden = true; });
}
