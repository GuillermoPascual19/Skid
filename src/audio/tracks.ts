// Músicas de fondo, todas generadas (sin archivos). Cada una programa un
// compás cada vez; el gestor (sound.ts) las va encadenando. `random` permite
// repetir el resultado en las pruebas.

import { BAR_S, bell, envelope, midi, musicBar, noise, silentGain } from './synth';

type Ctx = BaseAudioContext;

export type TrackId = 'calm' | 'aurora' | 'playful' | 'lofi';

export interface MusicTrack {
  readonly id: TrackId;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  /** Duración de un compás, en segundos. */
  readonly barSeconds: number;
  /** Ajuste de volumen para que todas suenen parecido con el mismo control (medido). */
  readonly level: number;
  bar(ctx: Ctx, out: AudioNode, t: number, index: number, random: () => number): void;
}

/** Oscilador con envolvente, la pieza básica de los instrumentos de abajo. */
function tone(
  ctx: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  { type = 'sine' as OscillatorType, peak = 0.05, attack = 0.005, decay = 0.4, detune = 0 } = {},
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.detune.setValueAtTime(detune, t);
  const env = envelope(ctx, t, peak, attack, decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** Golpe de ruido filtrado (platillos, caja). */
function hit(ctx: Ctx, out: AudioNode, t: number, type: BiquadFilterType, freq: number, peak: number, decay: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const env = envelope(ctx, t, peak, 0.002, decay);
  src.connect(filter).connect(env).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.05);
}

/** Pad: acorde sostenido que entra y sale despacio, con dos osciladores desafinados por nota. */
function pad(ctx: Ctx, out: AudioNode, t: number, notes: number[], length: number, opts: { type: OscillatorType; level: number; attack: number; release: number; cutoff: number }): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = opts.cutoff;
  filter.connect(out);
  for (const note of notes) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = opts.type;
      osc.frequency.setValueAtTime(midi(note), t);
      osc.detune.setValueAtTime(detune, t);
      const g = silentGain(ctx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.level, t + opts.attack);
      g.gain.setValueAtTime(opts.level, t + Math.max(opts.attack, length - 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + length + opts.release);
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + length + opts.release + 0.1);
    }
  }
}

// --------------------------------------------------------------------- Aurora

const AURORA_CHORDS = [
  [45, 52, 57, 59, 64], // La m (add9)
  [41, 48, 53, 57, 64], // Fa maj7
  [48, 55, 60, 62, 64], // Do (add9)
  [43, 50, 55, 59, 64], // Sol 6
];
const AURORA_BAR = 8;

function auroraBar(ctx: Ctx, out: AudioNode, t: number, index: number, random: () => number): void {
  const chord = AURORA_CHORDS[index % AURORA_CHORDS.length];
  pad(ctx, out, t, chord, AURORA_BAR, { type: 'sine', level: 0.03, attack: 3, release: 3, cutoff: 1400 });
  // Destellos: notas muy agudas y largas, como luces que aparecen y se van.
  for (let i = 0; i < 6; i++) {
    if (random() > 0.3) continue;
    const note = chord[Math.floor(random() * chord.length)] + 36;
    bell(ctx, out, t + i * (AURORA_BAR / 6) + random() * 0.4, midi(Math.min(note, 100)), 0.022, 3);
  }
}

// --------------------------------------------------------------- Copos alegres

const PLAYFUL_CHORDS = [
  [60, 64, 67], // Do
  [55, 59, 62], // Sol
  [57, 60, 64], // La m
  [53, 57, 60], // Fa
];
/** 4 tiempos a 100 por minuto. */
const PLAYFUL_BAR = 2.4;

function playfulBar(ctx: Ctx, out: AudioNode, t: number, index: number, random: () => number): void {
  const chord = PLAYFUL_CHORDS[index % PLAYFUL_CHORDS.length];
  const beat = PLAYFUL_BAR / 4;
  // Bajo en los tiempos 1 y 3.
  for (const b of [0, 2]) tone(ctx, out, t + b * beat, midi(chord[0] - 24), { type: 'triangle', peak: 0.045, decay: 0.45 });
  // Marimba: arpegio de corcheas que sube y baja por el acorde.
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern.forEach((p, i) => {
    if (i > 0 && random() < 0.15) return; // Algún hueco para que respire.
    const note = p === 3 ? chord[0] + 12 : chord[p];
    tone(ctx, out, t + i * (beat / 2), midi(note + 12), { type: 'triangle', peak: 0.045, decay: 0.28 });
    tone(ctx, out, t + i * (beat / 2), midi(note + 24), { type: 'sine', peak: 0.012, decay: 0.12 });
  });
  // Platillo muy suave a contratiempo.
  for (let i = 0; i < 4; i++) hit(ctx, out, t + i * beat + beat / 2, 'highpass', 7000, 0.012, 0.05);
}

// --------------------------------------------------------------- Lofi del iglú

const LOFI_CHORDS = [
  [50, 53, 57, 60, 64], // Re m9
  [43, 53, 57, 59, 64], // Sol 13
  [48, 52, 55, 59, 62], // Do maj9
  [45, 52, 55, 60, 64], // La m7
];
/** 4 tiempos a 75 por minuto. */
const LOFI_BAR = 3.2;

/** Piano eléctrico: fundamental + octava suave, filtrado y con caída larga. */
function epiano(ctx: Ctx, out: AudioNode, t: number, notes: number[], peak: number): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1600;
  filter.connect(out);
  for (const n of notes) {
    tone(ctx, filter, t, midi(n), { peak, attack: 0.01, decay: 2.4 });
    tone(ctx, filter, t, midi(n + 12), { peak: peak * 0.18, attack: 0.01, decay: 0.9 });
  }
}

function lofiBar(ctx: Ctx, out: AudioNode, t: number, index: number, random: () => number): void {
  const chord = LOFI_CHORDS[index % LOFI_CHORDS.length];
  const beat = LOFI_BAR / 4;
  const swing = beat * 0.62; // La segunda corchea de cada tiempo, un poco tarde.
  // Acordes en el 1 y en la "y" del 2.
  epiano(ctx, out, t, chord, 0.02);
  if (random() < 0.7) epiano(ctx, out, t + beat + swing, chord.slice(1), 0.013);
  // Bombo suave en 1 y 3.
  for (const b of [0, 2]) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(90, t + b * beat);
    osc.frequency.exponentialRampToValueAtTime(42, t + b * beat + 0.18);
    const env = envelope(ctx, t + b * beat, 0.08, 0.003, 0.22);
    osc.connect(env).connect(out);
    osc.start(t + b * beat);
    osc.stop(t + b * beat + 0.3);
  }
  // Caja apagada en 2 y 4, y platillo con swing.
  for (const b of [1, 3]) hit(ctx, out, t + b * beat, 'bandpass', 1800, 0.035, 0.12);
  for (let i = 0; i < 4; i++) {
    hit(ctx, out, t + i * beat, 'highpass', 8000, 0.01, 0.04);
    hit(ctx, out, t + i * beat + swing, 'highpass', 8000, 0.007, 0.03);
  }
}

// ------------------------------------------------------------------- Catálogo

export const TRACKS: readonly MusicTrack[] = [
  { id: 'calm', name: 'Hielo sereno', emoji: '🧊', description: 'Acordes lentos y cajita de música', barSeconds: BAR_S, level: 1, bar: musicBar },
  { id: 'aurora', name: 'Aurora', emoji: '🌌', description: 'Etérea, con destellos agudos', barSeconds: AURORA_BAR, level: 0.65, bar: auroraBar },
  { id: 'playful', name: 'Copos alegres', emoji: '❄️', description: 'Marimba animada y ritmo ligero', barSeconds: PLAYFUL_BAR, level: 3.7, bar: playfulBar },
  { id: 'lofi', name: 'Lofi del iglú', emoji: '☕', description: 'Piano eléctrico y batería suave', barSeconds: LOFI_BAR, level: 2.7, bar: lofiBar },
];

export function trackById(id: unknown): MusicTrack {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
