import assert from 'node:assert/strict';
import test from 'node:test';
import { attachAudioSpectrum, readAudioSpectrum } from '../src/utils/audioSpectrum.js';

function fixture(t, { coarse = false, userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const calls = { contexts: 0, sources: 0, connections: 0, listeners: 0 };
  class TrackedTarget extends EventTarget {
    addEventListener(...args) {
      calls.listeners += 1;
      super.addEventListener(...args);
    }
  }
  class AudioContext {
    constructor() {
      calls.contexts += 1;
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = {};
    }
    createAnalyser() {
      return { frequencyBinCount: 512, fftSize: 1024,
        connect() { calls.connections += 1; },
        getByteFrequencyData(bins) { bins.fill(128); },
      };
    }
    createMediaElementSource() {
      calls.sources += 1;
      return { connect() { calls.connections += 1; } };
    }
  }
  const document = new TrackedTarget();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    navigator: { userAgent, platform, maxTouchPoints }, AudioContext,
    matchMedia: () => ({ matches: coarse }),
  } });
  t.after(() => {
    attachAudioSpectrum(null);
    for (const [name, descriptor] of [['window', previousWindow], ['document', previousDocument]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const audio = new TrackedTarget();
  return { audio, document, calls };
}

for (const [name, device] of [
  ['touch phone', { coarse: true }],
  ['iPhone with a fine pointer', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }],
  ['Android', { userAgent: 'Mozilla/5.0 (Linux; Android 15)' }],
  ['iPad using desktop identification', { platform: 'MacIntel', maxTouchPoints: 5 }],
]) {
  test(`${name} keeps native audio output without creating a Web Audio graph`, (t) => {
    const { audio, document, calls } = fixture(t, device);
    audio.src = 'https://fixture.test/song.wav';
    audio.currentTime = 42;
    attachAudioSpectrum(audio);
    document.dispatchEvent(new Event('pointerdown'));
    audio.dispatchEvent(new Event('play'));
    assert.deepEqual(calls, { contexts: 0, sources: 0, connections: 0, listeners: 0 });
    assert.equal(audio.src, 'https://fixture.test/song.wav');
    assert.equal(audio.currentTime, 42);
    assert.equal(readAudioSpectrum(15), null);
  });
}

test('desktop retains live spectrum and reuses a single graph across playback events', async (t) => {
  const { audio, document, calls } = fixture(t, { platform: 'MacIntel' });
  attachAudioSpectrum(audio);
  assert.equal(calls.contexts, 0);
  document.dispatchEvent(new Event('pointerdown'));
  audio.dispatchEvent(new Event('play'));
  await Promise.resolve();
  assert.equal(calls.contexts, 1);
  assert.equal(calls.sources, 1);
  assert.equal(calls.connections, 2);
  const spectrum = readAudioSpectrum(15);
  assert.equal(spectrum.length, 15);
  assert.ok(spectrum.every(value => value > 3 && value <= 23));
  attachAudioSpectrum(null);
  document.dispatchEvent(new Event('pointerdown'));
  assert.equal(calls.contexts, 1);
  assert.equal(readAudioSpectrum(15), null);
});
