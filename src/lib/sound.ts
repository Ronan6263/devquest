/** Tiny WebAudio blips — no assets, foreman's-terminal flavored. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, at: number, dur = 0.09, gainPeak = 0.05, type: OscillatorType = 'square') {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playXpGain() {
  blip(520, 0);
  blip(780, 0.08);
}

export function playLevelUp() {
  blip(392, 0, 0.12, 0.06);
  blip(523, 0.1, 0.12, 0.06);
  blip(659, 0.2, 0.16, 0.06);
  blip(784, 0.3, 0.28, 0.07);
}

export function playTick() {
  blip(1240, 0, 0.03, 0.015, 'sine');
}
