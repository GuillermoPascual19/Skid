// Sonidos sintetizados con la Web Audio API: no hay archivos de audio. Cada
// función programa un sonido en `ctx` a partir del instante `t`, hacia `out`.
// Recibir el contexto como parámetro permite renderizarlos también en un
// OfflineAudioContext (para medir niveles sin escucharlos).

type Ctx = BaseAudioContext;

/** Frecuencia de una nota MIDI (69 = La 440). */
export const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

/** Un segundo de ruido blanco, creado una vez por contexto. */
function noise(ctx: Ctx): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Envolvente: sube a `peak` en `attack` s y cae exponencialmente durante `decay` s. */
function envelope(ctx: Ctx, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** Nota tipo campana: fundamental + un parcial inarmónico que se apaga antes. */
function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number, decay: number): void {
  const partials: [number, number, number][] = [
    [1, 1, decay],
    [2.76, 0.35, decay * 0.45],
    [5.4, 0.12, decay * 0.25],
  ];
  for (const [ratio, level, d] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, t);
    const env = envelope(ctx, t, peak * level, 0.005, d);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + d + 0.05);
  }
}

// --------------------------------------------------------------------- Efectos

/** Siseo de hielo mientras el pingüino desliza (ruido filtrado que baja de tono). */
export function slide(ctx: Ctx, out: AudioNode, t: number, durationS: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(5200, t);
  band.frequency.exponentialRampToValueAtTime(1800, t + durationS);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
  g.gain.setValueAtTime(0.16, t + Math.max(0.04, durationS * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + durationS + 0.05);
  src.connect(band).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + durationS + 0.1);
}

/** Golpe suave contra la nieve al pararse (o, más flojo, al chocar sin moverse). */
export function thud(ctx: Ctx, out: AudioNode, t: number, strength = 1): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.14);
  const env = envelope(ctx, t, 0.32 * strength, 0.004, 0.16);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.22);

  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 900;
  const nenv = envelope(ctx, t, 0.12 * strength, 0.002, 0.07);
  src.connect(low).connect(nenv).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.1);
}

/** Escala pentatónica (Do mayor) para las piezas: cada una suena más aguda que la anterior. */
const PENTATONIC = [0, 2, 4, 7, 9];

/** «Clin» al recoger la pieza número `index` (0, 1, 2...). */
export function collect(ctx: Ctx, out: AudioNode, t: number, index: number): void {
  const step = PENTATONIC[index % 5] + 12 * Math.floor(index / 5);
  const note = 84 + step; // Do6 en adelante.
  bell(ctx, out, t, midi(note), 0.2, 0.7);
  bell(ctx, out, t + 0.06, midi(note + 12), 0.08, 0.5);
}

/** Arpegio ascendente al terminar un nivel. */
export function win(ctx: Ctx, out: AudioNode, t: number): void {
  [72, 76, 79, 84].forEach((n, i) => bell(ctx, out, t + i * 0.09, midi(n), 0.2, 0.9));
}

/** Fanfarria de celebración (logros, hitos, ganador del día). */
export function fanfare(ctx: Ctx, out: AudioNode, t: number): void {
  [72, 76, 79, 84, 88].forEach((n, i) => bell(ctx, out, t + i * 0.08, midi(n), 0.18, 1.1));
  [84, 88, 91].forEach((n) => bell(ctx, out, t + 0.5, midi(n), 0.12, 1.8));
  for (let i = 0; i < 6; i++) bell(ctx, out, t + 0.7 + i * 0.07, midi(96 + PENTATONIC[i % 5]), 0.05, 0.35);
}

/** «Ding» suave al pedir una pista. */
export function hint(ctx: Ctx, out: AudioNode, t: number): void {
  bell(ctx, out, t, midi(79), 0.14, 0.6);
  bell(ctx, out, t + 0.12, midi(86), 0.12, 0.8);
}

/** Dos notas graves descendentes: callejón sin salida. */
export function stuck(ctx: Ctx, out: AudioNode, t: number): void {
  [64, 60].forEach((n, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midi(n), t + i * 0.22);
    const env = envelope(ctx, t + i * 0.22, 0.14, 0.02, 0.4);
    osc.connect(env).connect(out);
    osc.start(t + i * 0.22);
    osc.stop(t + i * 0.22 + 0.5);
  });
}

// --------------------------------------------------------------------- Música

/** Acordes lentos (en MIDI): Do maj9, La m7, Fa maj7, Sol 6 sus. */
const CHORDS = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 60, 64],
  [41, 48, 52, 57, 64],
  [43, 50, 55, 60, 62],
];
/** Duración de cada acorde, en segundos. */
export const BAR_S = 6.4;

/** Reverberación sintética: ruido que se apaga (sin archivos de respuesta de impulso). */
export function reverb(ctx: Ctx, seconds = 3.2): ConvolverNode {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

/**
 * Programa un compás de la música: el acorde `bar` (pad que entra y sale
 * despacio) y unas pocas notas de cajita de música elegidas al azar entre las
 * notas del acorde. `random` permite repetir el resultado en las pruebas.
 */
export function musicBar(ctx: Ctx, out: AudioNode, t: number, bar: number, random: () => number = Math.random): void {
  const chord = CHORDS[bar % CHORDS.length];
  const pad = ctx.createBiquadFilter();
  pad.type = 'lowpass';
  pad.frequency.value = 900;
  pad.connect(out);

  for (const note of chord) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midi(note), t);
      osc.detune.setValueAtTime(detune, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 1.8);
      g.gain.setValueAtTime(0.022, t + BAR_S - 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BAR_S + 1.8);
      osc.connect(g).connect(pad);
      osc.start(t);
      osc.stop(t + BAR_S + 2);
    }
  }

  // Cajita de música: notas sueltas del acorde, una o dos octavas por encima.
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    if (random() > 0.32) continue;
    const base = chord[Math.floor(random() * chord.length)];
    const note = base + (random() < 0.5 ? 24 : 36);
    bell(ctx, out, t + (i * BAR_S) / steps + 0.4, midi(Math.min(note, 96)), 0.035, 1.6);
  }
}
