// Cuenta: cerrar sesión en todos los dispositivos y borrar la cuenta (con todos sus datos).

import * as online from '../../shared/api';
import { h, openModal, toast } from '../../shared/dom';
import { go } from '../../shared/router';
import { resetProfile } from './profile';

/** Lo que se queda en el navegador al borrar la cuenta: solo ajustes del aparato, nada del jugador. */
const KEEP_KEYS = ['skid.theme.v1', 'skid.audio.v1', 'skid.guide.v1'];

/** Borra del navegador todo lo del jugador (progreso, retos, borradores…). */
function forgetLocalData(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('skid.') && !KEEP_KEYS.includes(key)) localStorage.removeItem(key);
    }
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
}

/** Confirmación con un botón peligroso; `action` se ejecuta al aceptar y el modal enseña su error si falla. */
function confirmDanger(opts: { title: string; text: string; button: string; action: () => Promise<void> }): void {
  const accept = h('button', { class: 'btn danger' }, opts.button);
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('h2', null, opts.title),
      h('p', { class: 'lead' }, opts.text),
      error,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'), accept),
    ],
    { dismissable: true },
  );
  accept.addEventListener('click', async () => {
    accept.disabled = true;
    try {
      await opts.action();
      modal.close();
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
      accept.disabled = false;
    }
  });
}

/** Cierra la sesión en todos los dispositivos (solo con la cuenta vinculada a Google). */
export function confirmLogoutEverywhere(): void {
  confirmDanger({
    title: '¿Cerrar sesión en todas partes?',
    text: 'Se cerrará en este y en todos tus dispositivos. Para volver, entra otra vez con Google. Úsalo si has perdido un móvil o has jugado en un ordenador ajeno.',
    button: 'Cerrar en todos',
    action: async () => {
      await online.logoutEverywhere();
      resetProfile();
      forgetLocalData();
      toast('Sesión cerrada en todos los dispositivos');
      go({ name: 'home' });
    },
  });
}

/** Borra la cuenta y todos sus datos, aquí y en el servidor. */
export function confirmDeleteAccount(): void {
  confirmDanger({
    title: '¿Borrar tu cuenta?',
    text: 'Se borrarán para siempre tu nombre, tu correo, tus partidas, rachas y logros, los niveles que has publicado y tus valoraciones. Las ligas que creaste pasarán a otro miembro. No se puede deshacer.',
    button: 'Borrar mi cuenta',
    action: async () => {
      try {
        window.google?.accounts.id.disableAutoSelect();
      } catch {
        // Sin script de Google cargado.
      }
      await online.deleteAccount();
      resetProfile();
      forgetLocalData();
      toast('Tu cuenta se ha borrado');
      go({ name: 'home' });
    },
  });
}
