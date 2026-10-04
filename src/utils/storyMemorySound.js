// A quiet, short mechanical chime for moving between memories.
export function createMemorySound() {
  let context;
  let lastPlayed = -Infinity;
  return {
    unlock() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        context ||= new AudioContext();
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch { /* Browsing remains available without Web Audio. */ }
    },
    play(volume) {
      if (!context || context.state !== 'running' || volume <= 0 || performance.now() - lastPlayed < 110) return;
      lastPlayed = performance.now();
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1150, now);
      oscillator.frequency.exponentialRampToValueAtTime(380, now + .065);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.07 * volume, now + .006);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .085);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now); oscillator.stop(now + .09);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    },
    close() { context?.close().catch(() => {}); context = undefined; },
  };
}
