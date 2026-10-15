// Nombre del jugador en el ranking online y cuenta de Google vinculada.

import { h, openModal, toast } from '../../shared/dom';
import { renderGoogleButton } from './google';
import { type Me, getMe, setName } from './api';
import { NAME_MAX, NAME_MIN, nameProblem } from '../../../../common/logic/players/names';
import { t, te } from '../../i18n/i18n';

let cachedMe: Promise<Me> | null = null;

/** Nombre y correo de Google del jugador de este dispositivo (se piden una vez). */
export function currentMe(): Promise<Me> {
  cachedMe ??= getMe().catch((err) => {
    cachedMe = null;
    throw err;
  });
  return cachedMe;
}

export async function currentName(): Promise<string | null> {
  return (await currentMe()).name;
}

/** Actualiza el gorro en la caché del perfil (tras ponérselo). */
export function setCachedHat(hat: Me['hat']): void {
  const previous = cachedMe;
  if (previous) cachedMe = previous.then((me) => ({ ...me, hat }));
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
      placeholder: t('name.placeholder'),
      autocomplete: 'nickname',
      'aria-label': t('name.placeholder'),
      'aria-describedby': 'name-error',
      oninput: () => {
        error.hidden = true;
        input.removeAttribute('aria-invalid');
      },
    });
    const error = h('p', { class: 'error field-error', id: 'name-error', role: 'alert', hidden: true });
    const save = h('button', { class: 'btn block big', type: 'submit' }, t('name.save'));

    const form = h(
      'form',
      {
        class: 'row',
        style: 'flex-direction: column',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          const name = input.value.trim().replace(/\s+/g, ' ');
          // Las mismas reglas que el servidor, para avisar sin esperar.
          const problem = nameProblem(name);
          if (problem) {
            error.textContent = te(problem === 'length' ? 'nameLength' : 'nameChars', { min: NAME_MIN, max: NAME_MAX });
            error.hidden = false;
            input.setAttribute('aria-invalid', 'true');
            return;
          }
          save.disabled = true;
          try {
            await setName(name);
            const me = await currentMe().catch(() => ({ name, email: null, hat: null, admin: false }));
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
    const googleBlock = initial ? null : h('div', { class: 'or-google', hidden: true }, h('p', { class: 'divider' }, t('name.or')), google);

    const modal = openModal(
      [
        h('h2', null, initial ? t('name.changeTitle') : t('name.title')),
        h('p', { class: 'lead' }, t('name.text')),
        form,
        googleBlock,
        h('button', { class: 'link-btn', onclick: () => finish(null) }, t('common.notNow')),
      ],
      { dismissable: true, onClose: () => finish(null) },
    );

    if (googleBlock) {
      void renderGoogleButton(google, (result) => {
        if (result.name) return finish(result.name);
        // Cuenta de Google nueva y sin nombre todavía: que lo elija aquí mismo.
        googleBlock.replaceChildren(h('p', { class: 'muted' }, t('name.connected', { email: result.email ?? 'Google' })));
      }).then((shown) => (googleBlock.hidden = !shown));
    }
    input.focus();
  });
}

/**
 * El nombre del jugador o, si aún no tiene, se le pide. Si no se puede saber (sin
 * conexión, demasiadas peticiones…) se avisa y se devuelve null: quien llama no
 * sigue, y el jugador sabe por qué no ha pasado nada.
 */
export async function ensureName(): Promise<string | null> {
  try {
    return (await currentName()) ?? (await askName());
  } catch (err) {
    toast((err as Error).message);
    return null;
  }
}
