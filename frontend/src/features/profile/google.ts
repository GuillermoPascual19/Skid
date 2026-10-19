// Botón "Continuar con Google" (Google Identity Services). Primero se muestra un
// botón propio y el script de Google solo se carga al pulsarlo: así Google no pone
// sus cookies a quien no ha pedido entrar (y no hace falta banner de cookies).
// Solo aparece si el servidor tiene configurado un ID de cliente.

import * as online from '../../shared/api';
import { h, svg, toast } from '../../shared/dom';
import { resetProfile } from './profile';
import { clearDaily } from '../daily/storage';
import { locale, t } from '../../i18n/i18n';

interface GoogleIdApi {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  /** Muestra el selector de cuenta de Google (si el navegador lo permite). */
  prompt(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gis: Promise<GoogleIdApi> | null = null;
/** Qué hacer cuando Google devuelve la cuenta (lo fija el último botón pintado). */
let onCredential: ((credential: string) => void) | null = null;

function loadGis(clientId: string): Promise<GoogleIdApi> {
  gis ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts.id;
      if (!api) return reject(new Error(t('google.noResponse')));
      api.initialize({ client_id: clientId, callback: ({ credential }) => onCredential?.(credential), ux_mode: 'popup' });
      resolve(api);
    };
    script.onerror = () => reject(new Error(t('google.loadFailed')));
    document.head.append(script);
  }).catch((err) => {
    gis = null;
    throw err;
  });
  return gis;
}

/** La «G» de Google en sus colores, para el botón propio. */
const G_LOGO = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.7 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>`;

/**
 * Pinta el botón «Continuar con Google» en `container`. Devuelve false (y no
 * pinta nada) si el login con Google no está configurado.
 */
export async function renderGoogleButton(container: HTMLElement, onSignedIn: (result: online.GoogleLogin) => void): Promise<boolean> {
  let clientId: string | null;
  try {
    clientId = await online.googleClientId();
  } catch {
    return false;
  }
  if (!clientId) return false;
  // Botón propio: hasta que se pulsa, no se carga nada de Google.
  const own = h('button', { class: 'google-own', type: 'button' }, t('google.continue'));
  own.prepend(svg(G_LOGO));
  own.addEventListener('click', () => void loadAndShow(container, clientId!, onSignedIn, own));
  container.replaceChildren(own);
  return true;
}

/** Al pulsar el botón propio: se carga Google, se pinta su botón y se abre el selector de cuenta. */
async function loadAndShow(container: HTMLElement, clientId: string, onSignedIn: (result: online.GoogleLogin) => void, own: HTMLButtonElement) {
  own.disabled = true;
  try {
    const api = await loadGis(clientId);
    onCredential = async (credential) => {
      try {
        const result = await online.loginWithGoogle(credential);
        resetProfile();
        // Otro jugador en este dispositivo: lo guardado del reto era del anterior.
        if (result.switched) clearDaily();
        onSignedIn(result);
      } catch (err) {
        toast((err as Error).message);
      }
    };
    container.replaceChildren();
    api.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      locale: locale(),
      width: Math.min(Math.max(container.clientWidth, 220), 400),
    });
    // El selector de cuenta directamente (si el navegador no lo muestra, queda el botón de Google).
    api.prompt();
  } catch (err) {
    own.disabled = false;
    container.replaceChildren(own);
    toast((err as Error).message);
  }
}

/** Cierra la sesión en este dispositivo; el siguiente uso crea un jugador anónimo. */
export async function signOut(): Promise<void> {
  try {
    window.google?.accounts.id.disableAutoSelect();
  } catch {
    // Sin script de Google cargado: nada que hacer.
  }
  await online.logout();
  resetProfile();
  clearDaily();
}
