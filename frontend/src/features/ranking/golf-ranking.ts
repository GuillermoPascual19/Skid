// Ranking por movimientos en un modal (menos es mejor): lo usan los niveles de
// jugadores y el reto semanal.

import { penguinSvg, type HatId } from '../../../../common/art/hats';
import { movesLabel } from '../../shared/result';
import { h, openModal, svg } from '../../shared/dom';
import { playerName, t } from '../../i18n/i18n';

export interface GolfRankingEntry {
  id: string;
  /** null si no ha elegido nombre (se muestra «Anónimo»). */
  name: string | null;
  hat: HatId | null;
  /** Puesto (los empatados comparten puesto). */
  position: number;
  moves: number;
  overPar: number;
  isMe: boolean;
  /** Autor del nivel (se marca con ✏️). */
  isAuthor: boolean;
}

export interface GolfRanking {
  optimal: number;
  total: number;
  top: GolfRankingEntry[];
  /** Tu puesto si no estás entre los de `top`, o null. */
  me: GolfRankingEntry | null;
}

const medal = (position: number) => ['🥇', '🥈', '🥉'][position - 1] ?? String(position);

function row(entry: GolfRankingEntry): HTMLElement {
  return h(
    'li',
    { class: `rank-row ${entry.isMe ? 'me' : ''}` },
    h('span', { class: 'pos' }, medal(entry.position)),
    h('span', { class: 'avatar' }, svg(penguinSvg(entry.hat))),
    h(
      'span',
      { class: 'who' },
      h('strong', null, entry.isMe ? t('ranking.me', { name: playerName(entry.name) }) : playerName(entry.name)),
      entry.isAuthor ? h('small', null, `✏️ ${t('ranking.author')}`) : null,
    ),
    h('span', { class: `pts moves${entry.overPar === 0 ? ' perfect' : ''}` }, movesLabel(entry.moves)),
  );
}

/** Abre el modal y lo rellena con lo que devuelva `load`. `summary` explica el resultado cargado. */
export async function openGolfRanking(opts: {
  eyebrow: string;
  title: string;
  load: () => Promise<GolfRanking>;
  summary: (ranking: GolfRanking) => string;
  empty: string;
}): Promise<void> {
  const list = h('ul', { class: 'ranking level-ranking' }, h('li', { class: 'empty' }, t('common.loading')));
  const summary = h('p', { class: 'muted' });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, opts.eyebrow),
      h('h2', null, opts.title),
      summary,
      list,
      h('button', { class: 'btn block', onclick: () => modal.close() }, t('common.close')),
    ],
    { dismissable: true },
  );
  try {
    const ranking = await opts.load();
    summary.textContent = opts.summary(ranking);
    const rows = ranking.top.map(row);
    // Si no estás entre los mejores, tu puesto va al final, separado.
    if (ranking.me && !ranking.top.some((e) => e.isMe)) rows.push(h('li', { class: 'gap', 'aria-hidden': 'true' }, '⋯'), row(ranking.me));
    list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'empty' }, opts.empty)]));
  } catch (err) {
    list.replaceChildren(h('li', { class: 'empty' }, (err as Error).message));
  }
}
