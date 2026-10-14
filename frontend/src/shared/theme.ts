// Tema claro u oscuro. Por defecto sigue al sistema; el jugador puede fijarlo.
// El CSS lee data-theme en <html> (ver el final de style.css) y el tablero, al
// dibujarse, pide su paleta con isDark().

import { h, toast } from './dom';
import { read, write } from './storage';
import { t } from '../i18n/i18n';

export type ThemeChoice = 'auto' | 'light' | 'dark';

const THEME_KEY = 'skid.theme.v1';
const ORDER: ThemeChoice[] = ['auto', 'dark', 'light'];
const ICON: Record<ThemeChoice, string> = { auto: '🌗', dark: '🌙', light: '☀️' };
const LABEL: Record<ThemeChoice, () => string> = { auto: () => t('theme.auto'), dark: () => t('theme.dark'), light: () => t('theme.light') };
/** Color de la barra del navegador en el móvil (el del cielo de arriba). */
const BAR_COLOR = { light: '#7cc8f7', dark: '#0b1626' };

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export function themeChoice(): ThemeChoice {
  const saved = read<ThemeChoice>(THEME_KEY);
  return saved && ORDER.includes(saved) ? saved : 'auto';
}

export function isDark(): boolean {
  const choice = themeChoice();
  return choice === 'dark' || (choice === 'auto' && systemDark.matches);
}

/** Aplica la elección guardada. Se llama al arrancar y cada vez que cambia. */
export function applyTheme(): void {
  const choice = themeChoice();
  if (choice === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', BAR_COLOR[isDark() ? 'dark' : 'light']);
}

// Si el sistema cambia de tema con el juego abierto, la barra del navegador también.
systemDark.addEventListener('change', applyTheme);

/** Botón redondo de la portada que pasa por automático → oscuro → claro. */
export function themeButton(): HTMLButtonElement {
  const button = h('button', { class: 'audio-btn' });
  const paint = () => {
    const choice = themeChoice();
    button.textContent = ICON[choice];
    button.title = LABEL[choice]();
    button.setAttribute('aria-label', t('theme.change', { theme: LABEL[choice]() }));
  };
  button.addEventListener('click', () => {
    const next = ORDER[(ORDER.indexOf(themeChoice()) + 1) % ORDER.length];
    write(THEME_KEY, next);
    applyTheme();
    paint();
    toast(LABEL[next]());
  });
  paint();
  return button;
}
