// Ranking al estilo golf en un modal («Par», «+2»): lo usan los niveles de
// jugadores y el reto semanal.

import { penguinSvg, type HatId } from '../../../../common/art/hats';
import { golfLabel } from '../../../../common/logic/daily/score';
import { h, openModal, plural, svg } from '../../shared/dom';

export interface GolfRankingEntry {
  id: string;
  name: string;
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
      h('strong', null, entry.name + (entry.isMe ? ' (tú)' : '')),
      h('small', null, [plural(entry.moves, 'movimiento', 'movimientos'), entry.isAuthor ? '✏️ autor' : null].filter(Boolean).join(' · ')),
    ),
    h('span', { class: `pts golf${entry.overPar === 0 ? ' par' : ''}` }, golfLabel(entry.overPar)),
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
  const list = h('ul', { class: 'ranking level-ranking' }, h('li', { class: 'empty' }, 'Cargando…'));
  const summary = h('p', { class: 'muted' });
  const modal = openModal(
    [h('p', { class: 'eyebrow' }, opts.eyebrow), h('h2', null, opts.title), summary, list, h('button', { class: 'btn block', onclick: () => modal.close() }, 'Cerrar')],
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
