// Gestor del audio: crea el contexto con el primer gesto del jugador (los
// navegadores no dejan sonar antes), separa efectos y música, guarda las
// preferencias y pausa todo cuando la pestaña no se ve.

import * as synth from './synth';

const SETTINGS_KEY = 'skid.audio.v1';
const SFX_VOLUME = 1;
/** La música va bastante por debajo de los efectos. */
const MUSIC_VOLUME = 0.28;
/** Cuánto se adelanta la programación de la música (segundos). */
const LOOKAHEAD_S = 1.5;

export interface AudioSettings {
  readonly sfx: boolean;
  readonly music: boolean;
}

function readSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { sfx: true, music: true, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  } catch {
    // Sin almacenamiento: valores por defecto.
  }
  return { sfx: true, music: true };
}

let settings = readSettings();
const listeners = new Set<(s: AudioSettings) => void>();

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicTimer = 0;
let nextBarAt = 0;
let bar = 0;

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
  musicBus.gain.value = settings.music ? MUSIC_VOLUME : 0;
  musicBus.connect(master);
  const musicSend = ctx.createGain();
  musicSend.gain.value = 0.8;
  musicBus.connect(musicSend).connect(room);
  return ctx;
}

/** Programa compases de música por adelantado mientras esté activada. */
function scheduleMusic(): void {
  if (!ctx || !musicBus || !settings.music || ctx.state !== 'running') return;
  if (nextBarAt < ctx.currentTime) nextBarAt = ctx.currentTime + 0.1;
  while (nextBarAt < ctx.currentTime + LOOKAHEAD_S) {
    synth.musicBar(ctx, musicBus, nextBarAt, bar++);
    nextBarAt += synth.BAR_S;
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
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento: dura lo que la pestaña.
  }
  const c = ensureContext();
  if (c && sfxBus && musicBus) {
    const now = c.currentTime;
    sfxBus.gain.setTargetAtTime(settings.sfx ? SFX_VOLUME : 0, now, 0.05);
    musicBus.gain.setTargetAtTime(settings.music ? MUSIC_VOLUME : 0, now, 0.4);
    void c.resume();
    if (settings.music) startMusicLoop();
    else stopMusicLoop();
  }
  listeners.forEach((fn) => fn(settings));
}

/** Avisa cuando cambian las preferencias (para actualizar los botones). */
export function onAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Silencio rápido en la partida: lo apaga todo, o lo vuelve a encender todo. */
export function toggleMute(): void {
  const anyOn = settings.sfx || settings.music;
  setAudioSettings({ sfx: !anyOn, music: !anyOn });
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
  bump: () => play((c, o, t) => synth.thud(c, o, t, 0.55)),
  collect: (index: number) => play((c, o, t) => synth.collect(c, o, t, index)),
  win: () => play((c, o, t) => synth.win(c, o, t)),
  fanfare: () => play((c, o, t) => synth.fanfare(c, o, t)),
  hint: () => play((c, o, t) => synth.hint(c, o, t)),
  stuck: () => play((c, o, t) => synth.stuck(c, o, t)),
};
