// Tiny synthesized soundboard — no assets, just WebAudio. A thunk
// when steel lands, a swish when it doesn't, a sting when you level.
// The Bard's Tale had songs; we at least get to beep with dignity.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

export function sfxEnabled(): boolean {
  return enabled;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; when?: number; slideTo?: number } = {},
): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + (opts.when ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
  const peak = opts.gain ?? 0.035;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export type SfxKind =
  | 'hit'
  | 'miss'
  | 'victory'
  | 'defeat'
  | 'levelup'
  | 'coin'
  | 'chest'
  | 'step'
  | 'stairs'
  | 'fight';

export function sfx(kind: SfxKind): void {
  if (!enabled) return;
  switch (kind) {
    case 'hit':
      tone(95, 0.09, { type: 'square', gain: 0.05, slideTo: 55 });
      break;
    case 'miss':
      tone(900, 0.07, { type: 'triangle', gain: 0.02, slideTo: 300 });
      break;
    case 'fight':
      tone(220, 0.05, { type: 'sawtooth', gain: 0.03 });
      tone(180, 0.08, { type: 'sawtooth', gain: 0.03, when: 0.06 });
      break;
    case 'victory':
      tone(392, 0.1, { type: 'triangle' });
      tone(523, 0.1, { type: 'triangle', when: 0.11 });
      tone(659, 0.22, { type: 'triangle', when: 0.22 });
      break;
    case 'defeat':
      tone(220, 0.18, { type: 'sawtooth', gain: 0.03 });
      tone(147, 0.35, { type: 'sawtooth', gain: 0.03, when: 0.2 });
      break;
    case 'levelup':
      tone(440, 0.08, { type: 'triangle' });
      tone(554, 0.08, { type: 'triangle', when: 0.09 });
      tone(659, 0.08, { type: 'triangle', when: 0.18 });
      tone(880, 0.25, { type: 'triangle', when: 0.27 });
      break;
    case 'coin':
      tone(1568, 0.05, { type: 'sine', gain: 0.03 });
      tone(2093, 0.09, { type: 'sine', gain: 0.03, when: 0.06 });
      break;
    case 'chest':
      tone(80, 0.2, { type: 'sawtooth', gain: 0.03, slideTo: 160 });
      tone(1319, 0.12, { type: 'sine', gain: 0.025, when: 0.22 });
      break;
    case 'step':
      tone(60, 0.04, { type: 'square', gain: 0.02, slideTo: 45 });
      break;
    case 'stairs':
      tone(110, 0.07, { type: 'square', gain: 0.025 });
      tone(90, 0.07, { type: 'square', gain: 0.025, when: 0.09 });
      tone(74, 0.09, { type: 'square', gain: 0.025, when: 0.18 });
      break;
  }
}
