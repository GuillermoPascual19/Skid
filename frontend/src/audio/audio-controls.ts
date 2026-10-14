// Botones y controles de sonido: en la portada (efectos y panel de música) y
// dentro del menú de pausa de la partida.

import { getAudioSettings, onAudioSettings, setAudioSettings, type AudioSettings } from './sound';
import { TRACKS } from './tracks';
import { h, openModal } from '../shared/dom';
import { t } from '../i18n/i18n';

export interface AudioControls {
  readonly el: HTMLElement;
  /** Deja de escuchar cambios de ajustes (al salir de la pantalla). */
  dispose(): void;
}

/** Dos botones (efectos y música) para la esquina de la portada. */
export function audioToggles(): AudioControls {
  const sfxBtn = h('button', { class: 'audio-btn', onclick: () => setAudioSettings({ sfx: !getAudioSettings().sfx }) });
  const musicBtn = h('button', { class: 'audio-btn', onclick: openSoundPanel });
  const paint = (s: AudioSettings) => {
    sfxBtn.textContent = s.sfx ? '🔊' : '🔇';
    sfxBtn.setAttribute('aria-label', s.sfx ? t('sound.sfxOff') : t('sound.sfxOn'));
    sfxBtn.setAttribute('aria-pressed', String(s.sfx));
    sfxBtn.title = s.sfx ? t('sound.sfxYes') : t('sound.sfxNo');
    musicBtn.textContent = '🎵';
    musicBtn.classList.toggle('off', !s.music);
    musicBtn.setAttribute('aria-label', t('sound.musicVolume'));
    musicBtn.title = s.music ? t('sound.musicAt', { percent: Math.round(s.musicVolume * 100) }) : t('sound.musicNo');
  };
  paint(getAudioSettings());
  return { el: h('div', { class: 'audio-toggles' }, sfxBtn, musicBtn), dispose: onAudioSettings(paint) };
}

/**
 * Controles de sonido (volumen y elección de música, efectos sí/no). Se usan
 * en el panel de la portada y en el menú de pausa de la partida.
 */
export function soundSettings({ compact = false }: { compact?: boolean } = {}): HTMLElement[] {
  const s = getAudioSettings();
  const percent = (v: number) => `${Math.round(v * 100)} %`;

  const volumeLabel = h('strong', null, s.music ? percent(s.musicVolume) : t('sound.off'));
  const slider = h('input', {
    type: 'range',
    class: 'volume',
    min: 0,
    max: 100,
    step: 5,
    value: String(s.music ? Math.round(s.musicVolume * 100) : 0),
    'aria-label': t('sound.musicVolume'),
  });
  const paintSlider = () => {
    const v = Number(slider.value);
    slider.style.setProperty('--fill', `${v}%`);
    volumeLabel.textContent = v === 0 ? t('sound.off') : `${v} %`;
  };
  slider.addEventListener('input', () => {
    paintSlider();
    setAudioSettings({ musicVolume: Number(slider.value) / 100 });
    paintTracks();
  });
  paintSlider();

  // Lista de músicas: al elegir una empieza a sonar (y enciende la música si estaba apagada).
  const options = TRACKS.map((track) =>
    h(
      'button',
      {
        class: 'track',
        role: 'radio',
        'data-track': track.id,
        onclick: () => {
          setAudioSettings({ track: track.id, music: true });
          const now = getAudioSettings();
          slider.value = String(Math.round(now.musicVolume * 100));
          paintSlider();
          paintTracks();
        },
      },
      h('span', { class: 'track-emoji', 'aria-hidden': 'true' }, track.emoji),
      h('span', { class: 'track-text' }, h('strong', null, t(`tracks.${track.id}.name`)), h('small', null, t(`tracks.${track.id}.description`))),
    ),
  );
  const paintTracks = () => {
    const { track, music } = getAudioSettings();
    for (const btn of options) {
      const selected = btn.dataset.track === track;
      btn.setAttribute('aria-checked', String(selected));
      btn.classList.toggle('selected', selected);
      btn.classList.toggle('muted-track', selected && !music);
      btn.tabIndex = selected ? 0 : -1;
    }
  };
  // Compacta (menú de pausa): cuadrícula de 2×2 sin descripciones, para que quepa todo.
  const trackList = h('div', { class: `tracks ${compact ? 'compact' : ''}`, role: 'radiogroup', 'aria-label': t('sound.music') }, ...options);
  // Flechas para moverse entre opciones, como en cualquier grupo de opciones.
  trackList.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    const i = TRACKS.findIndex((t) => t.id === getAudioSettings().track);
    const next = options[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    next.click();
    next.focus();
  });
  paintTracks();

  const sfxSwitch = h('input', { type: 'checkbox', class: 'switch', checked: s.sfx, 'aria-label': t('sound.sfx') });
  sfxSwitch.addEventListener('change', () => setAudioSettings({ sfx: sfxSwitch.checked }));

  return [
    h(
      'div',
      { class: 'sound-row' },
      h('div', { class: 'sound-label' }, h('span', null, `🎵 ${t('sound.music')}`), volumeLabel),
      h('div', { class: 'volume-row' }, h('span', { 'aria-hidden': 'true' }, '🔈'), slider, h('span', { 'aria-hidden': 'true' }, '🔊')),
      trackList,
    ),
    h('label', { class: 'sound-row switch-row' }, h('span', null, `🔔 ${t('sound.effects')}`), sfxSwitch),
  ];
}

/** Panel de sonido de la portada. */
export function openSoundPanel(): void {
  const modal = openModal([h('h2', null, t('sound.title')), ...soundSettings(), h('button', { class: 'btn block', onclick: () => modal.close() }, t('common.done'))], {
    dismissable: true,
  });
}
