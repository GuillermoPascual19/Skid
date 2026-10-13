// Botón "Continuar con Google" (Google Identity Services). El script de Google
// solo se carga si el servidor tiene configurado un ID de cliente.

import * as online from '../../shared/api';
import { toast } from '../../shared/dom';
import { resetProfile } from './profile';
import { clearDaily } from '../daily/storage';

interface GoogleIdApi {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
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
      if (!api) return reject(new Error('Google no respondió'));
      api.initialize({ client_id: clientId, callback: ({ credential }) => onCredential?.(credential), ux_mode: 'popup' });
      resolve(api);
    };
    script.onerror = () => reject(new Error('No se pudo cargar el login de Google'));
    document.head.append(script);
  }).catch((err) => {
    gis = null;
    throw err;
  });
  return gis;
}

/**
 * Pinta el botón de Google en `container`. Devuelve false (y no pinta nada) si el
 * login con Google no está configurado o no se puede cargar.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onSignedIn: (result: online.GoogleLogin) => void,
): Promise<boolean> {
  try {
    const clientId = await online.googleClientId();
    if (!clientId) return false;
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
      locale: 'es',
      width: Math.min(Math.max(container.clientWidth, 220), 400),
    });
    return true;
  } catch {
    return false;
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
