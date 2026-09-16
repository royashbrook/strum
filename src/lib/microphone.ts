import { FFT_SIZE, levelDb } from './analysis.ts';
import { followResonance, createHistory } from './resonance.ts';
import { FRAME_INTERVAL_MS } from './policy.ts';
import type { Reading, Capture, DetectorOptions, MicrophoneState } from './types.ts';

export class Microphone {
  private onFrame: (readings: Reading[], volume: number, capture: Capture) => void;
  private onState: (state: MicrophoneState, message: string) => void;
  private options: () => DetectorOptions;
  private generation = 0;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    onFrame: Microphone['onFrame'],
    onState: Microphone['onState'],
    options: Microphone['options'],
  ) {
    this.onFrame = onFrame;
    this.onState = onState;
    this.options = options;
    this.generation = 0;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      this.onState('error', 'Microphone needs a supported browser on HTTPS or localhost.');
      return;
    }
    this.onState('requesting', 'Allow microphone access to listen.');
    try {
      const context = new AudioContext();
      this.context = context;
      await context.resume();
      if (generation !== this.generation) {
        void context.close().catch(() => {});
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 1 },
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        void context.close().catch(() => {});
        return;
      }
      this.stream = stream;
      const actual = stream.getTracks()[0]?.getSettings?.() ?? {};
      // Read only audio configuration, never device IDs or microphone labels.
      const { echoCancellation, noiseSuppression, autoGainControl, channelCount } = actual;
      const capture = { echoCancellation, noiseSuppression, autoGainControl, channelCount };
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.source = source;
      const spectrum = new Float32Array(analyser.frequencyBinCount),
        samples = new Float32Array(FFT_SIZE);
      const resonance = createHistory();
      this.onState('listening', 'Strum gently. Let the strings ring.');
      for (const track of stream.getTracks())
        track.addEventListener('ended', () => {
          if (generation === this.generation)
            this.stop('Microphone disconnected. Tap the ear to try again.');
        });
      context.addEventListener('statechange', () => {
        if (generation === this.generation && context.state !== 'running')
          this.stop('Listening paused. Tap the ear to resume.');
      });
      this.timer = setInterval(() => {
        analyser.getFloatFrequencyData(spectrum);
        analyser.getFloatTimeDomainData(samples);
        const volume = levelDb(samples);
        this.onFrame(
          followResonance(
            spectrum,
            context.sampleRate,
            volume,
            this.options(),
            resonance,
            performance.now(),
            samples,
          ),
          volume,
          { ...capture, sampleRate: context.sampleRate },
        );
      }, FRAME_INTERVAL_MS);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      const name = error instanceof Error ? error.name : '';
      this.onState(
        'error',
        name === 'NotAllowedError'
          ? 'Microphone access was not allowed. Enable it in browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No microphone found. Connect one and try again.'
            : 'Could not start the microphone. Tap the ear to try again.',
      );
    }
  }
  stop(message = 'Tap the ear.') {
    ++this.generation;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.onState('idle', message);
  }
}
