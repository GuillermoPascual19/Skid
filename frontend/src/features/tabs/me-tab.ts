// Pestaña Tú: tu pingüino y tu nombre, logros y estadísticas, ajustes (idioma,
// tema, avisos, sonido), la cuenta (Google, cerrar sesión, borrarla) y los
// textos legales.

import { penguinSvg } from '../../../../common/art/hats';
import { h, openModal, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { withTabs } from '../../shared/tabs';
import { recall, remember } from '../../shared/cache';
import * as online from '../../shared/api';
import { audioToggles } from '../../audio/audio-controls';
import { themeButton } from '../../shared/theme';
import { languageButton } from '../../shared/language';
import { notificationsButton } from '../notifications/notifications';
import { renderGoogleButton, signOut } from '../profile/google';
import { askName, currentMe } from '../profile/profile';
import { confirmDeleteAccount, confirmLogoutEverywhere } from '../profile/account';
import type { Me } from '../profile/api';
import { setGlobalVisible } from '../ranking/api';
import { openGuide } from '../guide/guide';
import { locale, t } from '../../i18n/i18n';

const row = (icon: string, label: string, onclick: () => void) =>
  h('button', { class: 'list-row', onclick }, h('span', { 'aria-hidden': 'true' }, icon), h('span', null, label), h('span', { class: 'chevron' }, '›'));

/** Ajuste con su nombre a la izquierda y su botón a la derecha. */
const setting = (label: string, control: Element) => h('div', { class: 'list-row setting' }, h('span', null, label), control);

/** Salir en el ranking global o no: se guarda al momento y, si falla, vuelve como estaba. */
function globalRankingSwitch(): HTMLInputElement {
  const input = h('input', { type: 'checkbox', class: 'switch', checked: true, 'aria-label': t('me.globalRanking') });
  input.addEventListener('change', async () => {
    const visible = input.checked;
    input.disabled = true;
    try {
      await setGlobalVisible(visible);
      const me = recall<Me>('me');
      if (me) remember('me', { ...me, globalRanking: visible });
      toast(visible ? t('global.shown') : t('global.hiddenDone'));
    } catch (err) {
      input.checked = !visible;
      toast((err as Error).message);
    } finally {
      input.disabled = false;
    }
  });
  return input;
}

export function meTab(): Screen {
  const penguin = h('div', { class: 'me-penguin' }, svg(penguinSvg(recall<Me>('me')?.hat ?? null)));
  const name = h('h1');
  const account = h('div', { class: 'account' });
  const links = h('div', { class: 'card list-card' });
  const audio = audioToggles();
  const [sfx, music] = [...audio.el.children];
  const globalSwitch = globalRankingSwitch();

  function renderHeader(me: Me | null) {
    penguin.replaceChildren(svg(penguinSvg(me?.hat ?? null)));
    name.textContent = me?.name ?? t('common.anonymous');
    globalSwitch.checked = me?.globalRanking ?? true;
  }

  function renderLinks(me: Me | null) {
    const rows = [
      online.onlineEnabled ? row('🎩', t('nav.achievements'), () => go({ name: 'achievements' })) : null,
      online.onlineEnabled ? row('📊', t('nav.stats'), () => go({ name: 'stats' })) : null,
      row('❓', t('nav.rules'), () => openGuide()),
      // Solo para administradores (el panel va en español: no lo ven los jugadores).
      me?.admin ? row('🛡️', 'Admin', () => go({ name: 'admin' })) : null,
    ];
    links.replaceChildren(...rows.filter((r) => r !== null));
  }

  /** Quién juega en este dispositivo y, si no está vinculado, la invitación a entrar con Google. */
  function renderAccount(me: Me) {
    const changeName = h(
      'button',
      {
        class: 'link-btn',
        onclick: async () => {
          const chosen = await askName(me.name ?? '');
          if (chosen) {
            const next = { ...me, name: chosen };
            remember('me', next);
            renderHeader(next);
            renderAccount(next);
          }
        },
      },
      me.name ? t('home.account.changeName') : t('home.account.pickName'),
    );
    const who = h('p', { class: 'player-line' }, me.name ? `${t('home.account.playingAs', { name: me.name })} · ` : '', changeName);

    // Cerrar sesión en todas partes (con Google) y borrar la cuenta.
    const privacy = h(
      'p',
      { class: 'player-line small account-actions' },
      me.email ? h('button', { class: 'link-btn', onclick: confirmLogoutEverywhere }, t('home.account.logoutEverywhere')) : null,
      me.email ? ' · ' : null,
      h('button', { class: 'link-btn danger', onclick: confirmDeleteAccount }, t('home.account.deleteAccount')),
    );

    if (me.email) {
      account.replaceChildren(
        who,
        h(
          'p',
          { class: 'player-line small' },
          `🔗 ${t('home.account.googleAccount', { email: me.email })} · `,
          h('button', { class: 'link-btn', onclick: confirmSignOut }, t('home.account.signOut')),
        ),
        privacy,
      );
      return;
    }

    const slot = h('div', { class: 'google-slot' });
    const card = h(
      'section',
      { class: 'card account-card', hidden: true },
      h('p', { class: 'eyebrow' }, t('home.account.devicesEyebrow')),
      h('p', { class: 'muted' }, t('home.account.devicesText')),
      slot,
    );
    account.replaceChildren(who, card, privacy);
    void renderGoogleButton(slot, (result) => {
      if (result.switched) {
        toast(result.name ? t('home.account.signedInAs', { name: result.name }) : t('home.account.signedIn'));
        go({ name: 'home' }); // Otro jugador: se vuelve a cargar todo.
        return;
      }
      toast(t('home.account.linked'));
      renderAccount({ name: result.name, email: result.email, hat: me.hat, admin: false });
    }).then((shown) => (card.hidden = !shown));
  }

  function confirmSignOut() {
    const modal = openModal(
      [
        h('h2', null, t('home.signOut.title')),
        h('p', { class: 'lead' }, t('home.signOut.text')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.cancel')),
          h(
            'button',
            {
              class: 'btn secondary',
              onclick: async () => {
                modal.close();
                try {
                  await signOut();
                  toast(t('home.signOut.done'));
                } catch (err) {
                  toast((err as Error).message);
                }
                go({ name: 'home' });
              },
            },
            t('home.signOut.button'),
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  const el = h(
    'div',
    { class: 'screen tab-screen' },
    h('header', { class: 'me-head' }, penguin, name),
    links,
    h(
      'section',
      { class: 'card list-card' },
      h('h2', { class: 'list-title' }, t('me.settings')),
      setting(t('me.language'), languageButton()),
      setting(t('me.theme'), themeButton()),
      online.onlineEnabled ? setting(t('notifications.title'), notificationsButton()) : null,
      online.onlineEnabled ? setting(t('me.globalRanking'), globalSwitch) : null,
      setting(t('me.sfx'), sfx),
      setting(t('me.music'), music),
    ),
    online.onlineEnabled ? account : null,
    // Textos legales (páginas sueltas en /legal; el contacto, en el aviso legal).
    h(
      'footer',
      { class: 'site-footer' },
      h('a', { href: `/${locale()}/` }, t('me.about')),
      h('a', { href: '/legal/privacidad.html' }, t('footer.privacy')),
      h('a', { href: '/legal/terminos.html' }, t('footer.terms')),
      h('a', { href: '/legal/aviso-legal.html' }, t('footer.legal')),
      h('a', { href: '/legal/aviso-legal.html#contacto' }, t('footer.contact')),
    ),
  );

  return {
    el: withTabs(el, 'me'),
    mount() {
      // Lo último que se vio, al instante; luego, lo del servidor.
      const saved = recall<Me>('me');
      renderHeader(saved);
      renderLinks(saved);
      if (saved) renderAccount(saved);
      if (!online.onlineEnabled) return;
      void currentMe()
        .then((me) => {
          remember('me', me);
          renderHeader(me);
          renderLinks(me);
          renderAccount(me);
        })
        .catch(() => {});
    },
    dispose() {
      audio.dispose();
    },
  };
}
