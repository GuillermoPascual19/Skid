// Turnstile de Cloudflare: antes de crear una cuenta nueva, una comprobación de
// que el juego lo usa una persona. Casi siempre es invisible; si Cloudflare tiene
// dudas, aparece una casilla abajo de la pantalla. Ver backend/src/turnstile.ts.

import { h } from './dom';
import { t } from '../i18n/i18n';

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = h('script', { src: SCRIPT, async: true });
    script.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'))));
    script.addEventListener('error', () => reject(new Error('turnstile')));
    document.head.append(script);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** La respuesta del widget para mandarla al crear la sesión. */
export async function humanCheck(siteKey: string): Promise<string> {
  let api: TurnstileApi;
  try {
    api = await load();
  } catch {
    throw new Error(t('common.humanCheck'));
  }
  return new Promise<string>((resolve, reject) => {
    const box = h('div', { class: 'turnstile-box', role: 'region', 'aria-label': t('common.humanCheckLabel') });
    document.body.append(box);
    const done = (fn: () => void) => {
      api.remove(id);
      box.remove();
      fn();
    };
    const id = api.render(box, {
      sitekey: siteKey,
      // Solo se ve si hace falta que la persona pulse algo.
      appearance: 'interaction-only',
      action: 'session', // El servidor comprueba que sea esta.
      callback: (token: string) => done(() => resolve(token)),
      'error-callback': () => done(() => reject(new Error(t('common.humanCheck')))),
      'timeout-callback': () => done(() => reject(new Error(t('common.humanCheck')))),
    });
  });
}
