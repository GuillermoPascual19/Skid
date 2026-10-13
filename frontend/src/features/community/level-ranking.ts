// Ranking de un nivel de la comunidad, al estilo golf: menos movimientos y, a
// igualdad, quien lo consiguió antes.

import { penguinSvg } from '../../../../common/art/hats';
import { golfLabel } from '../../../../common/logic/daily/score';
import { h, openModal, plural, svg } from '../../shared/dom';
import { type LevelRankingEntry, getLevelRanking } from './api';

const medal = (position: number) => ['🥇', '🥈', '🥉'][position - 1] ?? String(position);

function row(entry: LevelRankingEntry): HTMLElement {
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

/** Abre el ranking del nivel `id`. */
export async function openLevelRanking(id: string, name: string): Promise<void> {
  const list = h('ul', { class: 'ranking level-ranking' }, h('li', { class: 'empty' }, 'Cargando…'));
  const summary = h('p', { class: 'muted' });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, 'Ranking del nivel'),
      h('h2', null, name),
      summary,
      list,
      h('button', { class: 'btn block', onclick: () => modal.close() }, 'Cerrar'),
    ],
    { dismissable: true },
  );
  try {
    const ranking = await getLevelRanking(id);
    summary.textContent = `Óptimo ${ranking.optimal} · ${plural(ranking.total, 'jugador lo ha superado', 'jugadores lo han superado')}. A igualdad, gana quien lo consiguió antes.`;
    const rows = ranking.top.map(row);
    // Si no estás entre los mejores, tu puesto va al final, separado.
    if (ranking.me && !ranking.top.some((e) => e.isMe)) rows.push(h('li', { class: 'gap', 'aria-hidden': 'true' }, '⋯'), row(ranking.me));
    list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'empty' }, 'Nadie lo ha superado todavía.')]));
  } catch (err) {
    list.replaceChildren(h('li', { class: 'empty' }, (err as Error).message));
  }
}
