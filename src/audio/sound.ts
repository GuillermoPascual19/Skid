// Gestor del audio: crea el contexto con el primer gesto del jugador (los
// navegadores no dejan sonar antes), separa efectos y música, guarda las
// preferencias y pausa todo cuando la pestaña no se ve.

import * as synth from './synth';
import { trackById, type TrackId } from './tracks';

const SETTINGS_KEY = 'skid.audio.v1';
const SFX_VOLUME = 1;
/** Ganancia de la música con el control al 100 %. Por defecto va bastante por debajo de los efectos. */
const MUSIC_MAX = 0.57;
/** Volumen de la música por defecto (control al 70 %, como antes de poder cambiarlo). */
const DEFAULT_MUSIC_VOLUME = 0.7;
/** Cuánto se adelanta la programación de la música (segundos). */
const LOOKAHEAD_S = 1.5;

export interface AudioSettings {
  readonly sfx: boolean;
  readonly music: boolean;
  /** Volumen de la música, de 0 a 1 (posición del control). */
  readonly musicVolume: number;
  /** Música elegida (ver tracks.ts). */
  readonly track: TrackId;
}

const DEFAULTS: AudioSettings = { sfx: true, music: true, musicVolume: DEFAULT_MUSIC_VOLUME, track: 'calm' };

/**
 * Ganancia de la música. El control va al cuadrado para que la mitad suene a
 * "la mitad" para el oído (una escala lineal sonaría casi igual de alta hasta abajo).
 */
function musicGain(s: AudioSettings): number {
  return s.music ? MUSIC_MAX * s.musicVolume ** 2 : 0;
}

function readSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
      return { ...saved, musicVolume: Math.min(1, Math.max(0, Number(saved.musicVolume) || 0)), track: trackById(saved.track).id };
    }
  } catch {
    // Sin almacenamiento: valores por defecto.
  }
  return DEFAULTS;
}

let settings = readSettings();
const listeners = new Set<(s: AudioSettings) => void>();

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicTimer = 0;
let nextBarAt = 0;
let bar = 0;
/** Canal de la música que suena: cada cambio de música crea uno nuevo y funde el anterior. */
let trackBus: GainNode | null = null;
let trackBusId: TrackId | null = null;

/** Canal para la música elegida; si ha cambiado, funde la anterior y empieza la nueva. */
function currentTrackBus(c: AudioContext, music: GainNode): GainNode {
  const track = trackById(settings.track);
  if (trackBus && trackBusId === track.id) return trackBus;
  if (trackBus) {
    const old = trackBus;
    old.gain.setTargetAtTime(0, c.currentTime, 0.4);
    setTimeout(() => old.disconnect(), 4000);
  }
  trackBus = c.createGain();
  trackBus.gain.value = track.level;
  trackBus.connect(music);
  trackBusId = track.id;
  bar = 0;
  nextBarAt = c.currentTime + 0.1; // La nueva empieza ya, sin esperar al compás de la anterior.
  return trackBus;
}

/** Crea el grafo de audio (solo tras un gesto del jugador). */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();

  const master = ctx.createDynamicsCompressor(); // Evita que se sature si coinciden muchos sonidos.
  master.threshold.value = -10;
  master.connect(ctx.destination);

  const room = synth.reverb(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  room.connect(wet).connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sfx ? SFX_VOLUME : 0;
  sfxBus.connect(master);
  const sfxSend = ctx.createGain();
  sfxSend.gain.value = 0.25;
  sfxBus.connect(sfxSend).connect(room);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicGain(settings);
  musicBus.connect(master);
  const musicSend = ctx.createGain();
  musicSend.gain.value = 0.8;
  musicBus.connect(musicSend).connect(room);
  return ctx;
}

/** Programa compases de música por adelantado mientras esté activada. */
function scheduleMusic(): void {
  if (!ctx || !musicBus || musicGain(settings) === 0 || ctx.state !== 'running') return;
  if (nextBarAt < ctx.currentTime) nextBarAt = ctx.currentTime + 0.1;
  while (nextBarAt < ctx.currentTime + LOOKAHEAD_S) {
    const track = trackById(settings.track);
    track.bar(ctx, currentTrackBus(ctx, musicBus), nextBarAt, bar++, Math.random);
    nextBarAt += track.barSeconds;
  }
}

function startMusicLoop(): void {
  if (musicTimer) return;
  scheduleMusic();
  musicTimer = window.setInterval(scheduleMusic, 500);
}

function stopMusicLoop(): void {
  clearInterval(musicTimer);
  musicTimer = 0;
}

/** Activa el audio con el primer gesto del jugador. Se llama una vez al arrancar. */
export function installAudio(): void {
  const unlock = () => {
    const c = ensureContext();
    if (!c) return;
    void c.resume().then(() => settings.music && startMusicLoop());
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Sin sonar en segundo plano (otra pestaña, el móvil bloqueado...).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      stopMusicLoop();
      void ctx.suspend();
    } else {
      void ctx.resume().then(() => settings.music && startMusicLoop());
    }
  });
}

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function setAudioSettings(next: Partial<AudioSettings>): void {
  settings = { ...settings, ...next };
  // Subir el volumen desde 0 enciende la música; bajarlo a 0 la apaga.
  if (next.musicVolume !== undefined) settings = { ...settings, music: next.musicVolume > 0 };
  if (next.music && settings.musicVolume === 0) settings = { ...settings, musicVolume: DEFAULT_MUSIC_VOLUME };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento: dura lo que la pestaña.
  }
  const c = ensureContext();
  if (c && sfxBus && musicBus) {
    const now = c.currentTime;
    sfxBus.gain.setTargetAtTime(settings.sfx ? SFX_VOLUME : 0, now, 0.05);
    holdAt(musicBus.gain, now); // Por si una sintonía la tenía bajada.
    musicBus.gain.setTargetAtTime(musicGain(settings), now, 0.15);
    void c.resume();
    if (musicGain(settings) > 0) {
      // Al elegir otra música, cambia ya (sin esperar a que acabe lo ya programado).
      if (next.track && musicBus) currentTrackBus(c, musicBus);
      startMusicLoop();
      scheduleMusic();
    } else stopMusicLoop();
  }
  listeners.forEach((fn) => fn(settings));
}

/** Avisa cuando cambian las preferencias (para actualizar los botones). */
export function onAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Anula lo programado en `param` dejándolo donde esté ahora (sin saltos de volumen). */
function holdAt(param: AudioParam, t: number): void {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    const value = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(value, t);
  }
}

/** Baja la música durante `seconds` para que se oiga bien una sintonía, y la recupera poco a poco. */
function duckMusic(seconds: number): void {
  if (!settings.sfx || !ctx || !musicBus || ctx.state !== 'running') return;
  const gain = musicGain(settings);
  const now = ctx.currentTime;
  holdAt(musicBus.gain, now);
  musicBus.gain.setTargetAtTime(gain * 0.3, now, 0.05);
  musicBus.gain.setTargetAtTime(gain, now + seconds, 0.6);
}

/** Ejecuta un efecto si los efectos están activados y el audio ya está en marcha. */
function play(fn: (c: AudioContext, out: AudioNode, t: number) => void): void {
  if (!settings.sfx || !ctx || !sfxBus || ctx.state !== 'running') return;
  try {
    fn(ctx, sfxBus, ctx.currentTime + 0.005);
  } catch {
    // Un efecto que falla nunca debe romper el juego.
  }
}

export const sfx = {
  slide: (durationMs: number) => play((c, o, t) => synth.slide(c, o, t, durationMs / 1000)),
  land: () => play((c, o, t) => synth.thud(c, o, t, 1)),
  bump: () => play((c, o, t) => {
    synth.thud(c, o, t, 0.55);
    synth.squawk(c, o, t + 0.02);
  }),
  collect: (index: number) => play((c, o, t) => synth.collect(c, o, t, index)),
  win: () => {
    duckMusic(synth.WIN_S);
    play((c, o, t) => synth.win(c, o, t));
  },
  fanfare: () => play((c, o, t) => synth.fanfare(c, o, t)),
  hint: () => play((c, o, t) => synth.hint(c, o, t)),
  stuck: () => play((c, o, t) => synth.stuck(c, o, t)),
};
