// Nombre del jugador en el ranking online.

import * as online from '../services/online';
import { h, openModal } from './dom';

let cachedName: string | null | undefined;

export async function currentName(): Promise<string | null> {
  if (cachedName === undefined) cachedName = await online.getName();
  return cachedName;
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
            cachedName = name;
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

    const modal = openModal(
      [
        h('h2', null, initial ? 'Cambia tu nombre' : '¿Cómo te llamas?'),
        h('p', { class: 'lead' }, 'Es el nombre que verán tus amigos en el ranking.'),
        form,
        h('button', { class: 'link-btn', onclick: () => finish(null) }, 'Ahora no'),
      ],
      { dismissable: true, onClose: () => finish(null) },
    );
    input.focus();
  });
}

export async function ensureName(): Promise<string | null> {
  return (await currentName()) ?? askName();
}
