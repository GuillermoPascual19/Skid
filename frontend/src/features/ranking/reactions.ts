// Reacciones al reto diario de los amigos: la fila del ranking (las recibidas y
// el botón para reaccionar) y la tarjeta de la portada con las nuevas.

import { penguinSvg } from '../../../../common/art/hats';
import { shiftDay } from '../../../../common/logic/daily/daily';
import { REACTIONS, REACTION_DAYS, REACTION_IDS, type ReactionId } from '../../../../common/logic/leagues/reactions';
import { h, openModal, svg, toast } from '../../shared/dom';
import { go } from '../../shared/router';
import { read, write } from '../../shared/storage';
import { intlLocale, playerName, t, tn } from '../../i18n/i18n';
import { today } from '../daily/daily';
import { type RankingRow, type ReceivedReaction, newReactions, react } from './api';

const SEEN_KEY = 'skid.reactionsSeen.v1';
/** En un dispositivo nuevo, la portada avisa solo de las de estos últimos días. */
const FIRST_LOOK_DAYS = 3;
/** Avisos que caben en la tarjeta; del resto solo se dice cuántos hay. */
const CARD_LINES = 3;

/** ¿Aún se puede reaccionar al reto de `day`? */
export function canReact(day: string): boolean {
  return day > shiftDay(today(), -REACTION_DAYS) && day <= today();
}

/**
 * Debajo de cada resultado del ranking: las reacciones que recibió y, en los
 * de los demás, el botón para reaccionar. `onChange` vuelve a pintar el ranking.
 */
export function reactionsLine(row: RankingRow, day: string, onChange: () => void): HTMLElement | null {
  const mayReact = !row.isMe && row.status === 'finished' && canReact(day);
  if (row.reactions.length === 0 && !mayReact) return null;
  return h(
    'span',
    { class: 'reactions' },
    ...row.reactions.map((r) =>
      h(
        'span',
        { class: `reaction-chip ${r.id === row.myReaction ? 'mine' : ''}`, title: t(`reactions.names.${r.id}`) },
        `${REACTIONS[r.id]}${r.n > 1 ? ` ${r.n}` : ''}`,
      ),
    ),
    mayReact
      ? h(
          'button',
          {
            class: 'reaction-add',
            'aria-label': t('reactions.react'),
            title: t('reactions.react'),
            onclick: (e: Event) => {
              e.stopPropagation(); // La fila abre el perfil.
              openPicker(row, day, onChange);
            },
          },
          // La tuya ya se ve (con borde) entre las recibidas.
          '☺+',
        )
      : null,
  );
}

function openPicker(row: RankingRow, day: string, onChange: () => void) {
  const name = playerName(row.name);
  const choose = async (reaction: ReactionId | null) => {
    modal.close();
    try {
      await react(day, row.id, reaction);
      if (reaction) toast(t('reactions.sent', { emoji: REACTIONS[reaction], name }));
      onChange();
    } catch (err) {
      toast((err as Error).message);
    }
  };
  const modal = openModal(
    [
      h('h2', null, t('reactions.title', { name })),
      h(
        'div',
        { class: 'reaction-picker' },
        ...REACTION_IDS.map((id) =>
          h(
            'button',
            {
              class: `reaction-option ${id === row.myReaction ? 'selected' : ''}`,
              'aria-label': t(`reactions.names.${id}`),
              'aria-pressed': String(id === row.myReaction),
              onclick: () => void choose(id === row.myReaction ? null : id),
            },
            REACTIONS[id],
          ),
        ),
      ),
      row.myReaction ? h('button', { class: 'link-btn', onclick: () => void choose(null) }, t('reactions.remove')) : null,
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close')),
    ],
    { dismissable: true },
  );
}

/** "hoy", "ayer", "hace 3 días", en el idioma del jugador. */
function when(day: string): string {
  const days = Math.round((Date.parse(today()) - Date.parse(day)) / 86_400_000);
  return new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' }).format(-days, 'day');
}

/** Tarjeta de la portada con las reacciones que llegaron desde la última vez. */
export function reactionsCard(): { el: HTMLElement; load: () => Promise<void> } {
  const el = h('section', { class: 'card reactions-card', hidden: true });

  function render(items: ReceivedReaction[]) {
    const rest = items.length - CARD_LINES;
    el.replaceChildren(
      h(
        'div',
        { class: 'reactions-head' },
        h('p', { class: 'eyebrow' }, t('reactions.home.eyebrow')),
        h('button', { class: 'icon-btn small', 'aria-label': t('common.close'), onclick: () => (el.hidden = true) }, '✕'),
      ),
      h(
        'ul',
        { class: 'reaction-list' },
        ...items
          .slice(0, CARD_LINES)
          .map((r) =>
            h(
              'li',
              null,
              h('span', { class: 'avatar' }, svg(penguinSvg(r.hat))),
              h('span', null, t('reactions.home.line', { name: playerName(r.name), emoji: REACTIONS[r.reaction], when: when(r.day) })),
            ),
          ),
      ),
      ...(rest > 0 ? [h('p', { class: 'muted' }, tn('reactions.home.more', rest))] : []),
      h('button', { class: 'link-btn', onclick: () => go({ name: 'ranking' }) }, t('reactions.home.see')),
    );
    el.hidden = false;
  }

  return {
    el,
    async load() {
      const since = read<number>(SEEN_KEY) ?? Date.now() - FIRST_LOOK_DAYS * 86_400_000;
      try {
        const items = await newReactions(since);
        if (items.length === 0) return;
        // Se avisa una vez: la próxima vez solo saldrán las que lleguen después.
        write(SEEN_KEY, Math.max(...items.map((r) => r.at)));
        render(items);
      } catch {
        // Sin conexión: se avisará la próxima vez.
      }
    },
  };
}
