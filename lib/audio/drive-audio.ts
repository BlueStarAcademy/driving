/** Lightweight Web Audio cues for drive immersion */

let ctx: AudioContext | null = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function beep(freq: number, dur: number, gain = 0.04, type: OscillatorType = "sine") {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(c.destination);
  const t = c.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur);
}

export function playTurnTick() {
  beep(880, 0.08, 0.03, "square");
}

export function playHazard() {
  beep(520, 0.12, 0.05, "triangle");
}

export function playToll() {
  beep(660, 0.15, 0.05);
  setTimeout(() => beep(880, 0.18, 0.04), 120);
}

export function playParkDone() {
  beep(523, 0.12, 0.05);
  setTimeout(() => beep(659, 0.12, 0.05), 130);
  setTimeout(() => beep(784, 0.2, 0.05), 260);
}

export function playEngineIdle(active: boolean) {
  // Placeholder hook — full loop would need a shared oscillator; keep silent for now
  void active;
}
