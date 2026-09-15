import { FFT_SIZE, levelDb } from './analysis.js';
import { followResonance } from './resonance.js';

export class Microphone {
  constructor(onFrame, onState, options) {
    this.onFrame = onFrame; this.onState = onState; this.options = options; this.generation = 0;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      this.onState('error', 'Microphone needs a supported browser on HTTPS or localhost.'); return;
    }
    this.onState('requesting', 'Allow microphone access to listen.');
    let context, stream;
    try {
      context = new AudioContext(); this.context = context;
      await context.resume();
      if (generation !== this.generation) { void context.close().catch(() => {}); return; }
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 },
      }});
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); void context.close().catch(() => {}); return; }
      this.stream = stream;
      const actual = stream.getTracks()[0]?.getSettings?.() ?? {};
      // Read only audio configuration, never device IDs or microphone labels.
      const capture = Object.fromEntries(['echoCancellation', 'noiseSuppression', 'autoGainControl', 'channelCount'].map(key => [key, actual[key]]));
      const analyser = context.createAnalyser(); analyser.fftSize = FFT_SIZE; analyser.smoothingTimeConstant = 0;
      const source = context.createMediaStreamSource(stream); source.connect(analyser); this.source = source;
      const spectrum = new Float32Array(analyser.frequencyBinCount), samples = new Float32Array(FFT_SIZE);
      const resonance = [];
      this.onState('listening', 'Strum gently. Let the strings ring.');
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (generation === this.generation) this.stop('Microphone disconnected. Tap listen to try again.');
      });
      context.addEventListener('statechange', () => {
        if (generation === this.generation && context.state !== 'running')
          this.stop('Listening paused. Tap listen to resume.');
      });
      this.timer = setInterval(() => {
        analyser.getFloatFrequencyData(spectrum); analyser.getFloatTimeDomainData(samples);
        const volume = levelDb(samples);
        this.onFrame(followResonance(spectrum, context.sampleRate, volume, this.options(), resonance, performance.now()), volume, { ...capture, sampleRate: context.sampleRate });
      }, 90);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.onState('error', error?.name === 'NotAllowedError' ? 'Microphone access was not allowed. Enable it in browser settings, then try again.'
        : error?.name === 'NotFoundError' ? 'No microphone found. Connect one and try again.' : 'Could not start the microphone. Tap listen to try again.');
    }
  }
  stop(message = 'Tap listen, then strum all six strings.') {
    ++this.generation; clearInterval(this.timer); this.timer = null;
    this.source?.disconnect(); this.source = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.context?.close().catch(() => {}); this.context = null;
    this.onState('idle', message);
  }
}
