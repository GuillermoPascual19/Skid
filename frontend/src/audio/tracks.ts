// Músicas de fondo, todas generadas (sin archivos). Cada una programa un
// compás cada vez; el gestor (sound.ts) las va encadenando. `random` permite
// repetir el resultado en las pruebas.

import { BAR_S, bell, envelope, midi, musicBar, noise, silentGain } from './synth';

type Ctx = BaseAudioContext;

export type TrackId = 'calm' | 'aurora' | 'playful' | 'lofi';

export interface MusicTrack {
  readonly id: TrackId;
  /** El nombre y la descripción están en los diccionarios (tracks.<id>). */
  readonly emoji: string;
  /** Duración de un compás, en segundos. */
  readonly barSeconds: number;
  /** Ajuste de volumen para que todas suenen parecido con el mismo control (medido). */
  readonly level: number;
  bar(ctx: Ctx, out: AudioNode, t: number, index: number, random: () => number): void;
}

/** Oscilador con envolvente, la pieza básica de los instrumentos de abajo. */
function tone(ctx: Ctx, out: AudioNode, t: number, freq: number, { type = 'sine' as OscillatorType, peak = 0.05, attack = 0.005, decay = 0.4, detune = 0 } = {}): void {
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

// --------------------------------------------------------------------- Aurora
// Distinta de Hielo sereno a propósito: en vez de acordes con campanitas al
// azar, un zumbido grave que "respira" (filtro que se abre y se cierra), un
// motivo cristalino que se repite con eco y un viento helado de fondo.

/** Raíz grave y notas del motivo (La menor, Fa, Do, Sol). */
const AURORA_HARMONY = [
  { root: 33, motif: [69, 72, 76, 79, 76, 72] }, // La m
  { root: 29, motif: [69, 72, 77, 81, 77, 72] }, // Fa
  { root: 36, motif: [67, 72, 76, 79, 76, 72] }, // Do
  { root: 31, motif: [67, 71, 74, 79, 74, 71] }, // Sol
];
const AURORA_BAR = 8;
/** Separación entre notas del motivo y entre ecos. */
const AURORA_STEP = AURORA_BAR / 12;
const AURORA_ECHO = 0.5;

function auroraBar(ctx: Ctx, out: AudioNode, t: number, index: number, random: () => number): void {
  const { root, motif } = AURORA_HARMONY[index % AURORA_HARMONY.length];

  // Zumbido grave: dientes de sierra (raíz y quinta) por un filtro que sube y baja.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(220, t);
  filter.frequency.linearRampToValueAtTime(1300, t + AURORA_BAR * 0.5);
  filter.frequency.linearRampToValueAtTime(220, t + AURORA_BAR);
  filter.connect(out);
  for (const note of [root, root + 7, root + 12]) {
    for (const detune of [-9, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midi(note), t);
      osc.detune.setValueAtTime(detune, t);
      const g = silentGain(ctx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 1.5);
      g.gain.setValueAtTime(0.012, t + AURORA_BAR - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + AURORA_BAR + 1.5);
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + AURORA_BAR + 1.6);
    }
  }

  // Motivo cristalino que se repite dos veces por compás, cada nota con dos ecos.
  for (let i = 0; i < 12; i++) {
    const note = motif[i % motif.length] + 12;
    const at = t + i * AURORA_STEP;
    [0.03, 0.012, 0.005].forEach((peak, echo) => {
      tone(ctx, out, at + echo * AURORA_ECHO, midi(note), { type: 'triangle', peak, attack: 0.004, decay: 0.9 });
    });
  }
  // De vez en cuando, un destello más agudo.
  if (random() < 0.5) bell(ctx, out, t + AURORA_BAR * (0.25 + random() * 0.5), midi(motif[3] + 24), 0.012, 2.5);

  // Viento helado: ruido filtrado que crece y se va.
  const wind = ctx.createBufferSource();
  wind.buffer = noise(ctx);
  wind.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.8;
  band.frequency.setValueAtTime(500, t);
  band.frequency.linearRampToValueAtTime(900, t + AURORA_BAR * 0.6);
  band.frequency.linearRampToValueAtTime(500, t + AURORA_BAR);
  const wg = silentGain(ctx);
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.exponentialRampToValueAtTime(0.02, t + AURORA_BAR * 0.5);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + AURORA_BAR + 1);
  wind.connect(band).connect(wg).connect(out);
  wind.start(t, random() * 0.5);
  wind.stop(t + AURORA_BAR + 1.1);
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
  { id: 'calm', emoji: '🧊', barSeconds: BAR_S, level: 1, bar: musicBar },
  { id: 'aurora', emoji: '🌌', barSeconds: AURORA_BAR, level: 2.3, bar: auroraBar },
  { id: 'playful', emoji: '❄️', barSeconds: PLAYFUL_BAR, level: 3.7, bar: playfulBar },
  { id: 'lofi', emoji: '☕', barSeconds: LOFI_BAR, level: 2.7, bar: lofiBar },
];

export function trackById(id: unknown): MusicTrack {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
