// Botones de sonido: en la portada, efectos y música por separado; en la
// partida, un silencio rápido que lo apaga o enciende todo.

import { getAudioSettings, onAudioSettings, setAudioSettings, toggleMute, type AudioSettings } from '../audio/sound';
import { h } from './dom';

export interface AudioControls {
  readonly el: HTMLElement;
  /** Deja de escuchar cambios de ajustes (al salir de la pantalla). */
  dispose(): void;
}

/** Dos botones (efectos y música) para la esquina de la portada. */
export function audioToggles(): AudioControls {
  const sfxBtn = h('button', { class: 'audio-btn', onclick: () => setAudioSettings({ sfx: !getAudioSettings().sfx }) });
  const musicBtn = h('button', { class: 'audio-btn', onclick: () => setAudioSettings({ music: !getAudioSettings().music }) });
  const paint = (s: AudioSettings) => {
    sfxBtn.textContent = s.sfx ? '🔊' : '🔇';
    sfxBtn.setAttribute('aria-label', s.sfx ? 'Desactivar efectos de sonido' : 'Activar efectos de sonido');
    sfxBtn.setAttribute('aria-pressed', String(s.sfx));
    sfxBtn.title = s.sfx ? 'Efectos: sí' : 'Efectos: no';
    musicBtn.textContent = '🎵';
    musicBtn.classList.toggle('off', !s.music);
    musicBtn.setAttribute('aria-label', s.music ? 'Desactivar música' : 'Activar música');
    musicBtn.setAttribute('aria-pressed', String(s.music));
    musicBtn.title = s.music ? 'Música: sí' : 'Música: no';
  };
  paint(getAudioSettings());
  return { el: h('div', { class: 'audio-toggles' }, sfxBtn, musicBtn), dispose: onAudioSettings(paint) };
}

/** Un botón pequeño de silencio para la partida. */
export function muteButton(): AudioControls {
  const btn = h('button', { class: 'audio-btn small', onclick: toggleMute });
  const paint = (s: AudioSettings) => {
    const on = s.sfx || s.music;
    btn.textContent = on ? '🔊' : '🔇';
    btn.setAttribute('aria-label', on ? 'Silenciar' : 'Activar el sonido');
    btn.title = on ? 'Silenciar' : 'Activar el sonido';
  };
  paint(getAudioSettings());
  return { el: btn, dispose: onAudioSettings(paint) };
}
