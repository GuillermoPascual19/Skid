// Nombre del jugador en el ranking online y cuenta de Google vinculada.

import * as online from '../services/online';
import { h, openModal } from './dom';
import { renderGoogleButton } from './google';

let cachedMe: Promise<online.Me> | null = null;

/** Nombre y correo de Google del jugador de este dispositivo (se piden una vez). */
export function currentMe(): Promise<online.Me> {
  cachedMe ??= online.getMe().catch((err) => {
    cachedMe = null;
    throw err;
  });
  return cachedMe;
}

export async function currentName(): Promise<string | null> {
  return (await currentMe()).name;
}

/** Olvida lo que se sabe del jugador (tras entrar con Google o cerrar sesión). */
export function resetProfile(): void {
  cachedMe = null;
}

/** Pide (o cambia) el nombre. Devuelve null si el jugador cancela. */
export function askName(initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (name: string | null) => {
      if (done) return;
      done = true;
      modal.close();
      resolve(name);
    };

    const input = h('input', {
      class: 'field',
      value: initial,
      maxLength: 20,
      placeholder: 'Tu nombre',
      autocomplete: 'nickname',
      'aria-label': 'Tu nombre',
    });
    const error = h('p', { class: 'error', hidden: true });
    const save = h('button', { class: 'btn block big', type: 'submit' }, 'Guardar');

    const form = h(
      'form',
      {
        class: 'row',
        style: 'flex-direction: column',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          const name = input.value.trim();
          if (name.length < 2) {
            error.textContent = 'Mínimo 2 caracteres';
            error.hidden = false;
            return;
          }
          save.disabled = true;
          try {
            await online.setName(name);
            const me = await currentMe().catch(() => ({ name, email: null }));
            cachedMe = Promise.resolve({ ...me, name });
            finish(name);
          } catch (err) {
            error.textContent = (err as Error).message;
            error.hidden = false;
            save.disabled = false;
          }
        },
      },
      input,
      error,
      save,
    );

    // La primera vez: quien ya juega en otro dispositivo puede entrar con Google
    // y recuperar su nombre, sus ligas y su historial.
    const google = h('div', { class: 'google-slot' });
    const googleBlock = initial ? null : h('div', { class: 'or-google', hidden: true }, h('p', { class: 'divider' }, 'o'), google);

    const modal = openModal(
      [
        h('h2', null, initial ? 'Cambia tu nombre' : '¿Cómo te llamas?'),
        h('p', { class: 'lead' }, 'Es el nombre que verán tus amigos en el ranking.'),
        form,
        googleBlock,
        h('button', { class: 'link-btn', onclick: () => finish(null) }, 'Ahora no'),
      ],
      { dismissable: true, onClose: () => finish(null) },
    );

    if (googleBlock) {
      void renderGoogleButton(google, (result) => {
        if (result.name) return finish(result.name);
        // Cuenta de Google nueva y sin nombre todavía: que lo elija aquí mismo.
        googleBlock.replaceChildren(h('p', { class: 'muted' }, `Conectado con ${result.email ?? 'Google'}. Ahora elige tu nombre.`));
      }).then((shown) => (googleBlock.hidden = !shown));
    }
    input.focus();
  });
}

export async function ensureName(): Promise<string | null> {
  return (await currentName()) ?? askName();
}
