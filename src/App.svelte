<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Tuner from './components/Tuner.svelte';
  import StrumCue from './components/StrumCue.svelte';
  import { Microphone } from './lib/microphone.ts';
  import { rememberTuning } from './lib/tuning-memory.ts';
  import { TUNINGS, tuningFor } from './lib/tunings.ts';
  import { listeningProfiles, type ListeningProfile } from './lib/listening.ts';
  import { loadPreferences, savePreference } from './lib/preferences.ts';
  import { initialPwaState, startPwa } from './lib/pwa.ts';
  import { containTaps } from './lib/gestures.ts';
  import type { Capture, DisplayReading, MicrophoneState, TuningMemory } from './lib/types.ts';

  const saved = loadPreferences();
  let profile = $state<ListeningProfile>(saved.profile);
  let tuning = $state(saved.tuning);
  const config = $derived(listeningProfiles[profile]);
  let page = $state<'tuner' | 'settings' | 'about'>('tuner');
  let mode = $state<MicrophoneState>('idle');
  let message = $state('Tap the ear.');
  let heardNote = $state(false),
    hidden = $state(false),
    precision = $state(false);
  let volume = $state(-Infinity),
    capture = $state<Capture | null>(null),
    noteFound = $state(false);
  let reset = $state(0);
  const memory: TuningMemory[] = [];
  const empty = (): DisplayReading[] =>
    tuning.strings.map((s) => ({ ...s, state: 'quiet', cents: null, confidence: 0, level: 0 }));
  let readings = $state<DisplayReading[]>(empty());
  let pwa = $state(initialPwaState());
  let updates: ReturnType<typeof startPwa> | undefined;

  function resetReadings() {
    memory.length = 0;
    readings = empty();
    reset++;
  }
  const mic = new Microphone(
    (next, db, actual) => {
      noteFound = next.some(
        (s) => s.state === 'flat' || s.state === 'sharp' || s.state === 'tuned',
      );
      if (noteFound) heardNote = true;
      readings = rememberTuning(next, memory);
      volume = db;
      capture = actual;
    },
    (next, text) => {
      mode = next;
      message = text;
      if (next !== 'listening') resetReadings();
    },
    () => ({ ...config, tuning: tuning.id }),
  );

  async function navigate(next: typeof page) {
    page = next;
    if (next === 'about' || (next === 'settings' && mode === 'requesting')) mic.stop();
    updates?.hideCoach();
    await tick();
    document.getElementById(next === 'tuner' ? 'listen' : next + '-title')?.focus();
  }
  function listen() {
    void navigate('tuner');
    if (mode === 'listening' || mode === 'requesting') mic.stop();
    else void mic.start();
  }
  function changeTuning(id: string) {
    tuning = tuningFor(id);
    resetReadings();
    savePreference('strum.tuning.v1', tuning.id);
  }
  function changeProfile(next: ListeningProfile) {
    profile = next;
    savePreference('strum.listening.v2', next);
  }
  const listenLabel = $derived(
    mode === 'requesting' ? 'cancel' : mode === 'listening' ? 'stop listening' : 'listen',
  );
  const status = $derived(
    mode === 'listening' ? (heardNote ? 'Let it ring.' : 'Strum your guitar.') : message,
  );
  const flag = (value: unknown) =>
    value === true ? 'on' : value === false ? 'off' : 'not reported';

  onMount(() => {
    if (import.meta.env.PROD)
      updates = startPwa(
        (next) => (pwa = next),
        () => mic.stop(),
      );
    else
      pwa = {
        ...pwa,
        available: false,
        status: 'Updates are checked in the installed production app.',
      };
    const visibility = () => {
      hidden = document.hidden;
      if (hidden) mic.stop();
    };
    const stop = () => mic.stop();
    document.addEventListener('visibilitychange', visibility);
    addEventListener('pagehide', stop);
    return () => {
      updates?.destroy();
      mic.stop();
      document.removeEventListener('visibilitychange', visibility);
      removeEventListener('pagehide', stop);
    };
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && page !== 'tuner') void navigate('tuner');
  }}
/>
<main use:containTaps>
  <header>
    <h1>strum<span>.</span></h1>
    <span id="header-version">v{__APP_VERSION__}</span>
  </header>
  <section id="tuner" hidden={page !== 'tuner'} aria-label="Guitar tuner">
    <Tuner {readings} {precision} {status} {reset} active={page === 'tuner' && !hidden} />
    <aside id="install-coach" hidden={!pwa.coach || page !== 'tuner'}>
      <button
        id="install-shortcut"
        class="text-button"
        onclick={() => {
          void navigate('about');
          void updates?.install();
        }}>add to home screen</button
      >
      <button
        id="dismiss-install"
        class="text-button"
        aria-label="Dismiss home screen tip"
        onclick={() => updates?.dismissInstall()}>not now</button
      >
    </aside>
  </section>

  <section id="settings" hidden={page !== 'settings'} aria-label="Listening settings">
    <h2 id="settings-title" tabindex="-1">listening</h2>
    <p id="settings-status" hidden={mode === 'listening'}>{message}</p>
    <fieldset class="room-options">
      <legend class="sr-only">Listening preset</legend>
      <label
        ><input
          type="radio"
          name="room"
          value="quiet"
          checked={profile === 'quiet'}
          onchange={() => changeProfile('quiet')}
        /><span>Quiet guitar</span></label
      >
      <label
        ><input
          type="radio"
          name="room"
          value="noisy"
          checked={profile === 'noisy'}
          onchange={() => changeProfile('noisy')}
        /><span>Noisy room</span></label
      >
    </fieldset>
    <div class="tuning-row">
      <label for="tuning">tuning</label><select
        id="tuning"
        value={tuning.id}
        onchange={(event) => changeTuning(event.currentTarget.value)}
        >{#each TUNINGS as t}<option value={t.id}>{t.name}</option>{/each}</select
      >
    </div>
    <div id="input-signal" hidden={mode !== 'listening'} data-heard={String(noteFound)}>
      <span id="input-label"
        >{volume <= -100
          ? 'no sound reaching the mic'
          : noteFound
            ? 'note found'
            : volume < config.gate
              ? 'too quiet, move closer'
              : 'sound, but no clear note'}</span
      >
      <meter
        id="input-level"
        min="-100"
        max="0"
        low={config.gate}
        value={Math.max(-100, volume)}
        aria-label="Microphone input level"
      ></meter>
      <div class="signal-scale"><span>quieter</span><span>louder</span></div>
    </div>
    <label class="precision-row" for="precision"
      ><span>show numbers</span><input
        id="precision"
        type="checkbox"
        bind:checked={precision}
      /></label
    >
  </section>

  <section id="about" hidden={page !== 'about'}>
    <h2 id="about-title" tabindex="-1">a little room to tune.</h2>
    <p id="tuning-summary">
      {tuning.name}: {tuning.strings.map((s) => s.note).join(' ')}. A4 = 440 Hz.
    </p>
    <p>
      Standard, Drop D, Open D and Open G are in settings. Use open strings, without a capo. Below
      the middle: tighten gently. Above: loosen gently. A green thumbs-up means in tune.
    </p>
    <p>
      A hollow green thumbs-up remembers the last confirmed tuning as the sound fades. Each new
      listening session or tuning starts fresh. A dotted marker means the pitch is unclear; mute the
      other strings, then pluck that string. Turn on “show numbers” in listening settings for cents.
    </p>
    <p>
      Audio stays on this device, never recorded or uploaded. Listening stays on while you adjust
      settings. It stops in About or when you switch apps. The ear button starts or stops listening.
    </p>
    <p>No ads. No accounts. Nothing to buy.</p>
    <details>
      <summary>microphone details</summary>
      <p id="mic-details">
        {capture
          ? `${capture.sampleRate} Hz · ${capture.channelCount ?? '?'} channel(s). Noise reduction: ${flag(capture.noiseSuppression)}. Echo cancellation: ${flag(capture.echoCancellation)}. Automatic gain: ${flag(capture.autoGainControl)}.`
          : 'Tap the ear to check the microphone.'}
      </p>
      <p>
        Input: <span id="input-db">{volume <= -100 ? '< -100 dB' : Math.round(volume) + ' dB'}</span
        >
        · cutoff: <span id="threshold">{config.gate} dB</span>
      </p>
      <p>
        An unplugged electric can be very quiet. Try one string at a time close to the mic, or use a
        clean amp.
      </p>
      <p>
        On iPhone, if Mic Mode is available, choose Wide Spectrum instead of Voice Isolation. <a
          href="https://support.apple.com/en-us/101993">Apple’s mic settings</a
        >
      </p>
    </details>
    <p class="mark">
      made with love by <a href="https://royashbrook.com">roy</a> +
      <a href="https://royashbrook.com/agents">ai</a>
      · <a href="https://github.com/sponsors/royashbrook">sponsor me</a>
    </p>
    <p id="version">v{__APP_VERSION__} · build {__BUILD_ID__}</p>
    <div class="actions">
      <button
        id="check-update"
        class="secondary"
        disabled={pwa.checking || !pwa.available}
        onclick={() => void updates?.check()}>check for updates</button
      ><button
        id="install"
        class="secondary"
        hidden={!pwa.installable}
        onclick={() => void updates?.install()}>install strum</button
      >
    </div>
    <p id="update-status" role="status">{pwa.status}</p>
    <p id="install-hint" hidden={!pwa.installHint}>
      On iPhone or iPad, open this page in Safari. Tap Share, then Add to Home Screen, then Add.
      Keep this shortcut: updates arrive inside the app.
    </p>
  </section>

  <nav class="dock" aria-label="Strum controls">
    <button
      id="nav-settings"
      aria-label={page === 'settings' ? 'Back to tuner' : 'Listening settings'}
      aria-controls="settings"
      aria-expanded={page === 'settings'}
      title={page === 'settings' ? 'Back to tuner' : 'Listening settings'}
      data-current={page === 'settings' ? '' : undefined}
      onclick={() => void navigate(page === 'settings' ? 'tuner' : 'settings')}
      ><span class="dock-icon gear-icon" aria-hidden="true"></span></button
    >
    <button
      id="listen"
      aria-label={listenLabel}
      aria-pressed={mode === 'listening'}
      title={listenLabel}
      data-mode={mode}
      data-current={page === 'tuner' ? '' : undefined}
      onclick={listen}
      ><span class="dock-icon ear-icon" aria-hidden="true"></span><span
        class="stop-mark"
        aria-hidden="true"
      ></span><span id="listen-label" class="sr-only">{listenLabel}</span></button
    >
    <button
      id="nav-about"
      aria-label={page === 'about' ? 'Back to tuner' : 'About'}
      aria-controls="about"
      aria-expanded={page === 'about'}
      title={page === 'about' ? 'Back to tuner' : 'About'}
      data-current={page === 'about' ? '' : undefined}
      onclick={() => void navigate(page === 'about' ? 'tuner' : 'about')}
      ><span class="dock-icon info-icon" aria-hidden="true"></span></button
    >
  </nav>
</main>
<StrumCue
  visible={!heardNote && page === 'tuner' && !hidden && (mode === 'idle' || mode === 'listening')}
  listening={mode === 'listening'}
/>
<aside id="update-notice" hidden={!pwa.notice} aria-label="App update">
  <p role="status">a new strum is ready.</p>
  <button id="apply-update" disabled={pwa.applying} onclick={() => updates?.apply()}
    >{pwa.applying ? 'updating…' : 'update now'}</button
  ><button id="later-update" class="secondary" onclick={() => updates?.later()}>later</button>
  <p class="update-detail">Restarts the app and stops listening. Your settings stay.</p>
</aside>
