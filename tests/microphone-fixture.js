export async function fakeMic(page, behavior = 'resolve') {
  await page.addInitScript(behavior => {
    window.probe = { requests: 0, stops: 0, closes: 0 };
    const track = { stop() { window.probe.stops++; sessionStorage.setItem('test-track-stops', String(window.probe.stops)); }, addEventListener() {}, getSettings() { return { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }; } };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: constraints => {
      window.probe.requests++; window.probe.constraints = constraints;
      if (behavior === 'reject') return Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' }));
      if (behavior === 'defer') return new Promise(resolve => { window.resolveMic = () => resolve(stream); });
      return Promise.resolve(stream);
    } } });
    window.AudioContext = class {
      constructor() { this.state = 'running'; this.sampleRate = 48000; }
      resume() { return Promise.resolve(); } close() { this.state = 'closed'; window.probe.closes++; return Promise.resolve(); }
      addEventListener() {} createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { frequencyBinCount: 16384,
        getFloatFrequencyData(a) { a.fill(-Infinity); if (window.testSpectrum) a.set(window.testSpectrum); },
        getFloatTimeDomainData(a) { a.fill(window.testLevel ?? (window.testSpectrum?.length ? .1 : 0)); },
      }; }
    };
  }, behavior);
}
