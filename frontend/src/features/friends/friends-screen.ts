// Amigos directos: tu lista con el reto de hoy de cada uno, las solicitudes y
// cómo añadir a alguien (por su nombre o con tu enlace de amigo).

import { penguinSvg } from '../../../../common/art/hats';
import { h, openModal, share, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { movesLabel } from '../../shared/result';
import * as online from '../../shared/api';
import { ensureName } from '../profile/profile';
import { duelsCard, openNewDuel } from '../duels/duels';
import { setFriendRequests, withTabs } from '../../shared/tabs';
import { playerName, t } from '../../i18n/i18n';
import {
  type Friend,
  type FriendPlayer,
  type FriendsOverview,
  acceptFriend,
  addFriendByLink,
  dropFriendRequest,
  friendLink,
  getFriendLink,
  getFriendsOverview,
  removeFriend,
  requestFriend,
} from './api';

const avatar = (hat: FriendPlayer['hat']) => h('span', { class: 'avatar' }, svg(penguinSvg(hat)));

/** `add`: alguien abrió tu enlace de amigo (?amigo=…): se le pregunta si quiere añadirlo. */
export function friendsScreen(add?: string): Screen {
  const duels = online.onlineEnabled ? duelsCard() : null;
  const body = h('div', { class: 'friends-body' }, h('p', { class: 'empty' }, t('common.loading')));
  const el = h(
    'div',
    { class: 'screen' },
    h('header', { class: 'tab-title' }, h('h1', null, t('nav.friends')), h('p', { class: 'muted' }, t('friends.subtitle'))),
    duels?.el ?? null,
    h(
      'section',
      { class: 'card list-card' },
      h(
        'button',
        { class: 'list-row', onclick: () => go({ name: 'ranking' }) },
        h('span', { 'aria-hidden': 'true' }, '🏆'),
        h('span', null, t('friends.leagues')),
        h('span', { class: 'chevron' }, '›'),
      ),
      h(
        'button',
        { class: 'list-row', onclick: () => go({ name: 'global' }) },
        h('span', { 'aria-hidden': 'true' }, '🌍'),
        h('span', null, t('global.title')),
        h('span', { class: 'chevron' }, '›'),
      ),
    ),
    body,
  );

  let data: FriendsOverview | null = null;
  let disposed = false;

  async function load() {
    if (!online.onlineEnabled) {
      body.replaceChildren(h('section', { class: 'card empty' }, t('friends.needsOnline')));
      return;
    }
    try {
      data = await getFriendsOverview();
      setFriendRequests(data.incoming.length);
      if (!disposed) render();
    } catch (err) {
      if (disposed) return;
      body.replaceChildren(
        h(
          'section',
          { class: 'card empty' },
          h('p', { class: 'error' }, (err as Error).message),
          h('button', { class: 'btn', onclick: () => void load() }, t('common.retry')),
        ),
      );
    }
  }

  /** Hace algo con el servidor, avisa y recarga la lista. */
  async function act(action: () => Promise<unknown>, done?: string) {
    try {
      await action();
      if (done) toast(done);
      await load();
    } catch (err) {
      toast((err as Error).message);
    }
  }

  function render() {
    if (!data) return;
    const { friends, incoming, outgoing } = data;
    const parts: (HTMLElement | null)[] = [
      addCard(),
      incoming.length
        ? h(
            'section',
            { class: 'card friend-requests' },
            h('h2', null, t('friends.incoming')),
            ...incoming.map((p) =>
              h(
                'div',
                { class: 'friend-row' },
                avatar(p.hat),
                h('strong', null, playerName(p.name)),
                h(
                  'button',
                  { class: 'btn small', onclick: () => void act(() => acceptFriend(p.id), t('friends.nowFriends', { name: playerName(p.name) })) },
                  t('friends.accept'),
                ),
                h('button', { class: 'btn small ghost', onclick: () => void act(() => dropFriendRequest(p.id)) }, t('friends.decline')),
              ),
            ),
          )
        : null,
      h('section', { class: 'card' }, h('h2', null, t('friends.list')), ...(friends.length ? friends.map(friendRow) : [h('p', { class: 'muted' }, t('friends.empty'))])),
      outgoing.length
        ? h(
            'section',
            { class: 'card' },
            h('h2', null, t('friends.outgoing')),
            ...outgoing.map((p) =>
              h(
                'div',
                { class: 'friend-row' },
                avatar(p.hat),
                h('span', null, playerName(p.name)),
                h('button', { class: 'link-btn', onclick: () => void act(() => dropFriendRequest(p.id)) }, t('common.cancel')),
              ),
            ),
          )
        : null,
    ];
    body.replaceChildren(...parts.filter((part) => part !== null));
  }

  function addCard(): HTMLElement {
    const input = h('input', {
      class: 'field',
      placeholder: t('friends.namePlaceholder'),
      'aria-label': t('friends.namePlaceholder'),
      maxLength: 30,
      autocomplete: 'off',
    });
    const form = h('form', { class: 'friend-add' }, input, h('button', { class: 'btn small', type: 'submit' }, t('friends.send')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      void (async () => {
        if (!(await ensureName())) return;
        await act(async () => {
          const r = await requestFriend(name);
          toast(r.status === 'friends' ? t('friends.nowFriends', { name: r.name }) : t('friends.sent', { name: r.name }));
        });
      })();
    });
    return h(
      'section',
      { class: 'card' },
      h('h2', null, t('friends.addTitle')),
      h('p', { class: 'muted' }, t('friends.addText')),
      form,
      h(
        'button',
        {
          class: 'btn secondary block',
          onclick: async () => {
            if (!(await ensureName())) return;
            share(`👥 ${t('friends.linkText')}\n${friendLink(data!.me)}`);
          },
        },
        `🔗 ${t('friends.shareLink')}`,
      ),
    );
  }

  function friendRow(f: Friend): HTMLElement {
    const today =
      f.today.status === 'finished'
        ? h('span', { class: 'friend-today done' }, `✓ ${f.today.moves !== null ? movesLabel(f.today.moves) : t('friends.finished')}`)
        : h('span', { class: 'friend-today muted' }, f.today.status === 'playing' ? t('friends.playing') : t('friends.notYet'));
    return h(
      'div',
      { class: 'friend-row' },
      h(
        'button',
        { class: 'friend-open', onclick: () => go({ name: 'player', id: f.id }) },
        avatar(f.hat),
        h('span', { class: 'friend-name' }, h('strong', null, playerName(f.name)), today),
      ),
      h('button', { class: 'btn small secondary', 'aria-label': t('friends.challenge', { name: playerName(f.name) }), onclick: () => void challenge(f) }, '⚔️'),
      h('button', { class: 'icon-btn small', 'aria-label': t('friends.remove', { name: playerName(f.name) }), onclick: () => confirmRemove(f) }, '✕'),
    );
  }

  async function challenge(f: Friend) {
    if (!f.name) return;
    await openNewDuel(() => {}, { difficulty: 'medium', rival: { id: f.id, name: f.name, hat: f.hat } });
  }

  function confirmRemove(f: Friend) {
    const modal = openModal(
      [
        h('h2', null, t('friends.removeTitle', { name: playerName(f.name) })),
        h('p', { class: 'lead' }, t('friends.removeText')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.cancel')),
          h('button', { class: 'btn', onclick: () => (modal.close(), void act(() => removeFriend(f.id))) }, t('friends.removeButton')),
        ),
      ],
      { dismissable: true },
    );
  }

  /** Alguien abrió tu enlace: quién es y, si quiere, se añade. */
  async function confirmLink(id: string) {
    try {
      const p = await getFriendLink(id);
      if (p.isMe) return toast(t('friends.yourOwnLink'));
      if (p.already) return toast(t('friends.alreadyFriend', { name: playerName(p.name) }));
      const modal = openModal(
        [
          h('div', { class: 'friend-link-penguin', 'aria-hidden': 'true' }, svg(penguinSvg(p.hat))),
          h('h2', null, t('friends.linkTitle', { name: playerName(p.name) })),
          h('p', { class: 'lead' }, t('friends.linkQuestion')),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.notNow')),
            h(
              'button',
              {
                class: 'btn',
                onclick: async () => {
                  modal.close();
                  if (!(await ensureName())) return;
                  await act(() => addFriendByLink(id), t('friends.nowFriends', { name: playerName(p.name) }));
                },
              },
              t('friends.addButton'),
            ),
          ),
        ],
        { dismissable: true },
      );
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return {
    el: withTabs(el, 'friends'),
    mount: () => {
      void load();
      void duels?.load();
      if (add && online.onlineEnabled) void confirmLink(add);
    },
    dispose: () => {
      disposed = true;
    },
  };
}
