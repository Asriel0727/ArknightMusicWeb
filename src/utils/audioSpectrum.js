// One graph per audio element: never recreate its MediaElementAudioSourceNode.
const graphs = new WeakMap();
let activeGraph = null;
let detach = () => {};

export function attachAudioSpectrum(audio) {
  detach();
  activeGraph = null;
  if (!audio) return;
  const navigator = window.navigator;
  const isMobile = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
    || /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || '')
    || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
  // Creating a MediaElementAudioSourceNode permanently routes this element
  // through Web Audio. Skip it entirely on mobile so native background audio
  // does not depend on an AudioContext staying active. Static bars are used.
  if (isMobile) return;
  const activate = async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      let graph = graphs.get(audio);
      if (!graph) {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.78;
        graph = { context, analyser, source: null, bins: new Uint8Array(analyser.frequencyBinCount) };
        graphs.set(audio, graph);
      }
      if (graph.context.state !== 'running') await graph.context.resume();
      // Keep native audio playback untouched until the context can run.
      if (graph.context.state !== 'running') return;
      if (!graph.source) {
        graph.analyser.connect(graph.context.destination);
        graph.source = graph.context.createMediaElementSource(audio);
        graph.source.connect(graph.analyser);
      }
      activeGraph = graph;
    } catch {
      // Visualisation is optional; unsupported browsers keep the static bars.
    }
  };
  document.addEventListener('pointerdown', activate, { passive: true });
  document.addEventListener('keydown', activate);
  audio.addEventListener('play', activate);
  detach = () => {
    document.removeEventListener('pointerdown', activate);
    document.removeEventListener('keydown', activate);
    audio.removeEventListener('play', activate);
  };
}

export function readAudioSpectrum(count) {
  const graph = activeGraph;
  if (!graph || graph.context.state !== 'running') return null;
  graph.analyser.getByteFrequencyData(graph.bins);
  const binHz = graph.context.sampleRate / graph.analyser.fftSize;
  const upperHz = Math.min(12000, graph.context.sampleRate / 2);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.max(1, Math.floor(60 * (upperHz / 60) ** (index / count) / binHz));
    const end = Math.min(graph.bins.length, Math.max(start + 1,
      Math.ceil(60 * (upperHz / 60) ** ((index + 1) / count) / binHz)));
    let sum = 0;
    for (let bin = start; bin < end; bin++) sum += graph.bins[bin];
    return 3 + 20 * (sum / Math.max(1, end - start) / 255);
  });
}
