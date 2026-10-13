// Perfil de un amigo (se abre tocándolo en el ranking): su pingüino, racha,
// estadísticas, gorros y el cara a cara contigo.

import { HAT_NAMES, penguinSvg } from '../../../../common/art/hats';
import { ACHIEVEMENTS } from '../../../../common/logic/achievements/achievements';
import { h, plural, svg } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { scoreChart, tile } from '../daily/stats-screen';
import { type PlayerProfile, getPlayer } from './api';

export function playerScreen(id: string): Screen {
  const title = h('h1', null, 'Perfil');
  const subtitle = h('p');
  const body = h('div', { class: 'stats-body' }, h('p', { class: 'empty' }, 'Cargando…'));
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'ranking' }) }, '←'),
      h('div', { class: 'title' }, title, subtitle),
    ),
    body,
  );

  let disposed = false;

  async function load() {
    try {
      const p = await getPlayer(id);
      if (disposed) return;
      title.textContent = p.isMe ? 'Tu perfil' : (p.name ?? 'Jugador');
      subtitle.textContent = p.sharedLeagues.length ? p.sharedLeagues.join(' · ') : 'Reto diario';
      render(p);
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, 'Reintentar')),
      );
    }
  }

  function render(p: PlayerProfile) {
    const s = p.stats;
    const hats = ACHIEVEMENTS.filter((a) => p.achievements.includes(a.id));
    body.replaceChildren(
      h(
        'section',
        { class: 'card profile-head' },
        h('div', { class: 'wardrobe-penguin' }, svg(penguinSvg(p.hat))),
        h(
          'div',
          null,
          h('h2', null, p.name ?? 'Sin nombre'),
          h('p', { class: 'muted' }, p.hat ? `Lleva: ${HAT_NAMES[p.hat]}` : 'Sin gorro'),
          h(
            'div',
            { class: 'chips' },
            h('span', { class: 'chip' }, `🔥 ${plural(s.currentStreak, 'día', 'días')}`),
            h('span', { class: 'chip' }, `Mejor racha: ${s.bestStreak}`),
          ),
        ),
      ),
      ...(p.headToHead ? [headToHead(p.headToHead, p.name ?? 'Tu amigo')] : []),
      h(
        'div',
        { class: 'tiles' },
        tile('Retos jugados', s.played),
        tile('Mejor puntuación', s.bestScore ?? '—', s.perfect > 0 ? `⭐ ${plural(s.perfect, 'perfecto', 'perfectos')}` : null),
        tile('Media', s.averageScore ?? '—'),
        tile('Días ganados', s.wins),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'section-title' }, `Gorros · ${hats.length} de ${ACHIEVEMENTS.length}`),
        hats.length === 0
          ? h('p', { class: 'muted' }, 'Todavía no ha conseguido ninguno.')
          : h(
              'div',
              { class: 'hat-shelf' },
              ...hats.map((a) => h('div', { class: 'hat-item', title: `${a.name}: ${a.description}` }, svg(penguinSvg(a.hat)), h('small', null, HAT_NAMES[a.hat]))),
            ),
      ),
      h('section', { class: 'card chart-card' }, h('h2', null, 'Últimos 30 días'), scoreChart(s.history)),
    );
  }

  return {
    el,
    mount: () => void load(),
    dispose: () => {
      disposed = true;
    },
  };
}

/** Marcador de los días que jugasteis los dos. */
function headToHead(r: NonNullable<PlayerProfile['headToHead']>, name: string): HTMLElement {
  if (r.played === 0) {
    return h('section', { class: 'card h2h' }, h('p', { class: 'eyebrow' }, 'Cara a cara'), h('p', { class: 'muted' }, 'Aún no habéis jugado el mismo día.'));
  }
  const verdict = r.myWins > r.theirWins ? '¡Vas ganando!' : r.myWins < r.theirWins ? `${name} va por delante` : 'Empate técnico';
  return h(
    'section',
    { class: 'card h2h' },
    h('p', { class: 'eyebrow' }, 'Cara a cara'),
    h(
      'div',
      { class: 'h2h-score' },
      h('div', null, h('strong', null, String(r.myWins)), h('span', null, 'Tú')),
      h('span', { class: 'h2h-vs' }, '–'),
      h('div', null, h('strong', null, String(r.theirWins)), h('span', null, name)),
    ),
    h('p', { class: 'muted' }, `${verdict} · ${plural(r.played, 'reto jugado', 'retos jugados')} los dos${r.ties ? ` · ${plural(r.ties, 'empate', 'empates')}` : ''}`),
  );
}
