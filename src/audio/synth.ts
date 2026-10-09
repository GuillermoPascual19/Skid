// Sonidos sintetizados con la Web Audio API: no hay archivos de audio. Cada
// función programa un sonido en `ctx` a partir del instante `t`, hacia `out`.
// Recibir el contexto como parámetro permite renderizarlos también en un
// OfflineAudioContext (para medir niveles sin escucharlos).

type Ctx = BaseAudioContext;

/** Frecuencia de una nota MIDI (69 = La 440). */
export const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

/** Un segundo de ruido blanco, creado una vez por contexto. */
export function noise(ctx: Ctx): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/**
 * Ganancia que nace en silencio. Un GainNode nuevo vale 1 hasta que empieza su
 * automatización y, si el sonido arranca justo en ese instante, se cuela una
 * muestra a volumen completo: un clic audible.
 */
export function silentGain(ctx: Ctx): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  return g;
}

/** Envolvente: sube a `peak` en `attack` s y cae exponencialmente durante `decay` s. */
export function envelope(ctx: Ctx, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = silentGain(ctx);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** Nota tipo campana: fundamental + un parcial inarmónico que se apaga antes. */
export function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number, decay: number): void {
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
  const g = silentGain(ctx);
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

/** Nota tipo metal suave: dos sierras desafinadas con un filtro que se abre al atacar. */
function brass(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number, dur: number): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(freq * 1.5, t);
  filter.frequency.exponentialRampToValueAtTime(freq * 6, t + 0.06);
  filter.frequency.exponentialRampToValueAtTime(freq * 2.5, t + dur);
  const g = silentGain(ctx);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.025);
  g.gain.setValueAtTime(peak, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g).connect(out);
  for (const detune of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.setValueAtTime(detune, t);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

/** Duración aproximada de la sintonía de nivel superado (segundos). */
export const WIN_S = 2.6;

/** Sintonía de «¡enhorabuena!» al terminar un nivel: subida, «ta-chán» y destellos. */
export function win(ctx: Ctx, out: AudioNode, t: number): void {
  const step = 0.11;
  // Subida: Sol-Do-Mi-Sol, un respiro, Mi-Sol... y el acorde final.
  const lead: [number, number, number][] = [
    [67, 0, 1],
    [72, 1, 1],
    [76, 2, 1],
    [79, 3, 2],
    [76, 5, 1],
    [79, 6, 1.5],
  ];
  for (const [note, at, len] of lead) {
    brass(ctx, out, t + at * step, midi(note), 0.07, len * step + 0.06);
    bell(ctx, out, t + at * step, midi(note + 12), 0.1, 0.5);
  }
  const final = t + 8 * step;
  for (const note of [60, 64, 67, 72, 76]) brass(ctx, out, final, midi(note), 0.045, 1.5);
  [72, 76, 79, 84].forEach((n) => bell(ctx, out, final, midi(n), 0.11, 1.6));
  // Destellos que suben por encima del acorde.
  for (let i = 0; i < 7; i++) {
    const note = 91 + PENTATONIC[i % 5] + 12 * Math.floor(i / 5);
    bell(ctx, out, final + 0.18 + i * 0.06, midi(note), 0.04, 0.4);
  }
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

/**
 * Graznido de pingüino: voz nasal (sierra + cuadrada) que pasa por dos
 * formantes, con un temblor rápido de volumen que la vuelve rasposa. El tono
 * va de `from` a `peakAt` (Hz) en el primer tercio y acaba en `to`.
 */
function honk(ctx: Ctx, out: AudioNode, t: number, from: number, peakAt: number, to: number, dur: number, peak: number): void {
  const voice = ctx.createGain();
  voice.gain.value = 0.5;
  for (const [type, detune] of [['sawtooth', 0], ['square', 8]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(peakAt, t + dur * 0.3);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    osc.connect(voice);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Aspereza: el volumen tiembla a ~35 Hz.
  const rasp = ctx.createGain();
  rasp.gain.value = 0.7;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 32 + Math.random() * 8;
  const depth = ctx.createGain();
  depth.gain.value = 0.3;
  lfo.connect(depth).connect(rasp.gain);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  voice.connect(rasp);

  // Formantes de una vocal nasal entre «a» y «e».
  const env = envelope(ctx, t, peak, 0.015, dur);
  for (const [freq, q, level] of [
    [1100, 5, 1],
    [2600, 7, 0.45],
  ]) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level;
    rasp.connect(band).connect(g).connect(env);
  }
  env.connect(out);
}

/** «¡Cuac!» corto al chocar contra algo sin moverse. Varía un poco cada vez. */
export function squawk(ctx: Ctx, out: AudioNode, t: number): void {
  const k = 0.9 + Math.random() * 0.25;
  honk(ctx, out, t, 420 * k, 640 * k, 380 * k, 0.13, 0.5);
}

/** «Meeeh» triste que cae de tono, y dos notas graves: callejón sin salida. */
export function stuck(ctx: Ctx, out: AudioNode, t: number): void {
  honk(ctx, out, t, 520, 560, 260, 0.6, 0.45);
  [64, 60].forEach((n, i) => {
    const at = t + 0.55 + i * 0.22;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midi(n), at);
    const env = envelope(ctx, at, 0.09, 0.02, 0.4);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + 0.5);
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
      const g = silentGain(ctx);
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
