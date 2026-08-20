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


// ---------- Music: a two-voice chip sequencer ----------
// The Bard's Tale had songs. Ours are eight bars of square and
// triangle wave, scheduled ahead on the audio clock, looped forever.

export type MusicTheme = 'city' | 'dungeon' | 'combat' | 'off';

// semitones from A4
const N = (st: number) => 440 * Math.pow(2, st / 12);
const R = 0; // rest

interface Track {
  wave: OscillatorType;
  gain: number;
  /** [frequency (0 = rest), beats] */
  notes: [number, number][];
}

const THEMES: Record<Exclude<MusicTheme, 'off'>, { bpm: number; tracks: Track[] }> = {
  city: {
    bpm: 132,
    tracks: [
      {
        wave: 'triangle', gain: 0.02,
        notes: [
          [N(-2), 1], [N(0), 1], [N(3), 1], [N(0), 1], [N(5), 1.5], [N(3), 0.5], [N(0), 2],
          [N(-2), 1], [N(0), 1], [N(3), 1], [N(5), 1], [N(7), 1.5], [N(5), 0.5], [N(3), 2],
          [N(3), 1], [N(5), 1], [N(7), 1], [N(8), 1], [N(7), 1.5], [N(5), 0.5], [N(3), 2],
          [N(5), 1], [N(3), 1], [N(0), 1], [N(-2), 1], [N(0), 3], [R, 1],
        ],
      },
      {
        wave: 'square', gain: 0.011,
        notes: [
          [N(-26), 2], [N(-19), 2], [N(-26), 2], [N(-19), 2],
          [N(-24), 2], [N(-17), 2], [N(-24), 2], [N(-17), 2],
          [N(-21), 2], [N(-14), 2], [N(-21), 2], [N(-14), 2],
          [N(-26), 2], [N(-19), 2], [N(-26), 2], [N(-19), 2],
        ],
      },
    ],
  },
  dungeon: {
    bpm: 66,
    tracks: [
      {
        wave: 'triangle', gain: 0.016,
        notes: [
          [N(-9), 2], [N(-6), 2], [N(-4), 3], [R, 1],
          [N(-9), 2], [N(-2), 2], [N(-4), 3], [R, 1],
          [N(-6), 2], [N(-4), 2], [N(-9), 3], [R, 1],
          [N(-11), 2], [N(-9), 2], [R, 4],
        ],
      },
      {
        wave: 'sawtooth', gain: 0.007,
        notes: [
          [N(-33), 8], [N(-31), 8], [N(-28), 8], [N(-33), 8],
        ],
      },
    ],
  },
  combat: {
    bpm: 168,
    tracks: [
      {
        wave: 'square', gain: 0.016,
        notes: [
          [N(-9), 0.5], [N(-9), 0.5], [N(-2), 0.5], [N(-9), 0.5], [N(-4), 0.5], [N(-2), 0.5], [N(-6), 1],
          [N(-9), 0.5], [N(-9), 0.5], [N(-2), 0.5], [N(-4), 0.5], [N(-2), 1], [N(3), 1], [R, 0.5],
        ],
      },
      {
        wave: 'sawtooth', gain: 0.011,
        notes: [
          [N(-21), 0.5], [N(-21), 0.5], [N(-21), 0.5], [N(-21), 0.5], [N(-16), 0.5], [N(-16), 0.5], [N(-18), 1],
          [N(-21), 0.5], [N(-21), 0.5], [N(-21), 0.5], [N(-21), 0.5], [N(-14), 1], [N(-16), 1], [R, 0.5],
        ],
      },
    ],
  },
};

let musicEnabled = true;
let currentTheme: MusicTheme = 'off';
let musicTimer: ReturnType<typeof setInterval> | null = null;
let voiceTimes: number[] = [];
let voiceIdx: number[] = [];

export function setMusicEnabled(on: boolean): void {
  musicEnabled = on;
  if (!on) stopMusic();
}

function scheduleVoice(a: AudioContext, track: Track, v: number, secPerBeat: number): void {
  while (voiceTimes[v] < a.currentTime + 0.6) {
    const [freq, beats] = track.notes[voiceIdx[v] % track.notes.length];
    const dur = beats * secPerBeat;
    if (freq > 0) {
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = track.wave;
      osc.frequency.setValueAtTime(freq, voiceTimes[v]);
      g.gain.setValueAtTime(0.0001, voiceTimes[v]);
      g.gain.exponentialRampToValueAtTime(track.gain, voiceTimes[v] + 0.02);
      g.gain.setValueAtTime(track.gain, voiceTimes[v] + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, voiceTimes[v] + dur * 0.95);
      osc.connect(g).connect(a.destination);
      osc.start(voiceTimes[v]);
      osc.stop(voiceTimes[v] + dur);
    }
    voiceTimes[v] += dur;
    voiceIdx[v] += 1;
  }
}

export function stopMusic(): void {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
  for (const el of Object.values(themeAudio)) el?.pause();
  currentTheme = 'off';
}

// ---------- AI-composed and uploaded themes ----------
// The local LLM can write the sheet music (semitones + beats, JSON)
// and this sequencer performs it; or drop in real audio generated
// elsewhere (Suno, Udio, anything) and the game loops that instead.

export interface ComposedTrack {
  wave: OscillatorType;
  gain?: number;
  /** [semitones from A4, or null for a rest; beats] */
  notes: [number | null, number][];
}

export interface Composition {
  bpm: number;
  tracks: ComposedTrack[];
}

const CUSTOM_KEY = 'storyengine.music.compositions.v1';
const customCompositions: Partial<Record<Exclude<MusicTheme, 'off'>, { bpm: number; tracks: Track[] }>> = {};
const themeAudio: Partial<Record<Exclude<MusicTheme, 'off'>, HTMLAudioElement>> = {};

function compileComposition(comp: Composition): { bpm: number; tracks: Track[] } {
  const bpm = Math.min(220, Math.max(40, comp.bpm));
  const waves: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
  const tracks: Track[] = comp.tracks.slice(0, 3).map((t, i) => ({
    wave: waves.includes(t.wave) ? t.wave : i === 0 ? 'triangle' : 'square',
    gain: Math.min(0.03, Math.max(0.004, t.gain ?? (i === 0 ? 0.018 : 0.01))),
    notes: t.notes.slice(0, 96).map(([st, beats]) => [
      st === null || typeof st !== 'number' ? 0 : N(Math.min(24, Math.max(-40, st))),
      Math.min(8, Math.max(0.25, typeof beats === 'number' ? beats : 1)),
    ] as [number, number]),
  })).filter((t) => t.notes.length >= 4);
  if (!tracks.length) throw new Error('Composition has no playable tracks.');
  return { bpm, tracks };
}

/** Install (or clear) an LLM-written composition for a theme; persisted. */
export function setCustomComposition(theme: Exclude<MusicTheme, 'off'>, comp: Composition | null): void {
  const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '{}') as Record<string, Composition>;
  if (comp) {
    customCompositions[theme] = compileComposition(comp); // throws on garbage before storing
    stored[theme] = comp;
  } else {
    delete customCompositions[theme];
    delete stored[theme];
  }
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(stored));
  if (currentTheme === theme) {
    const t = theme;
    stopMusic();
    startMusic(t);
  }
}

export function loadCustomCompositions(): void {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '{}') as Record<string, Composition>;
    for (const [theme, comp] of Object.entries(stored)) {
      try {
        customCompositions[theme as Exclude<MusicTheme, 'off'>] = compileComposition(comp);
      } catch {
        // a bad stored composition falls back to the built-in tune
      }
    }
  } catch {
    // corrupt store: built-ins only
  }
}

/** Install (or clear) an uploaded audio loop for a theme. */
export function setThemeAudio(theme: Exclude<MusicTheme, 'off'>, url: string | null): void {
  themeAudio[theme]?.pause();
  delete themeAudio[theme];
  if (url) {
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0.35;
    themeAudio[theme] = el;
  }
  if (currentTheme === theme) {
    const t = theme;
    stopMusic();
    startMusic(t);
  }
}

export function themeSource(theme: Exclude<MusicTheme, 'off'>): 'audio' | 'composed' | 'built-in' {
  if (themeAudio[theme]) return 'audio';
  if (customCompositions[theme]) return 'composed';
  return 'built-in';
}

/** Switch the loop; no-op when the theme already plays. */
export function startMusic(theme: MusicTheme): void {
  if (!musicEnabled || theme === currentTheme) return;
  stopMusic();
  if (theme === 'off') return;
  currentTheme = theme;
  // uploaded audio beats the sequencer
  const audio = themeAudio[theme];
  if (audio) {
    void audio.play().catch(() => {});
    return;
  }
  const a = ac();
  if (!a) return;
  const def = customCompositions[theme] ?? THEMES[theme];
  const secPerBeat = 60 / def.bpm;
  voiceTimes = def.tracks.map(() => a.currentTime + 0.05);
  voiceIdx = def.tracks.map(() => 0);
  musicTimer = setInterval(() => {
    if (currentTheme !== theme) return;
    def.tracks.forEach((t, v) => scheduleVoice(a, t, v, secPerBeat));
  }, 150);
  def.tracks.forEach((t, v) => scheduleVoice(a, t, v, secPerBeat));
}
