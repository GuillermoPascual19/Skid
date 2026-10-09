// Estadísticas personales del reto diario: racha, totales y los últimos 30 días.

import * as online from '../services/online';
import { openDaily } from './daily';
import { formatDay, h, plural } from './dom';
import { currentName } from './profile';
import { go, type Screen } from './router';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function statsScreen(): Screen {
  const subtitle = h('p');
  const body = h('div', { class: 'stats-body' }, h('p', { class: 'empty' }, 'Cargando…'));
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Tus estadísticas'), subtitle),
    ),
    body,
  );

  let disposed = false;

  async function load() {
    if (!online.onlineEnabled) {
      body.replaceChildren(h('section', { class: 'card empty' }, 'Las estadísticas necesitan el ranking online.'));
      return;
    }
    try {
      const [stats, name] = await Promise.all([online.getStats(), currentName().catch(() => null)]);
      if (disposed) return;
      subtitle.textContent = name ? `Reto diario · ${name}` : 'Reto diario';
      render(stats);
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, 'Reintentar')),
      );
    }
  }

  function render(s: online.PlayerStats) {
    body.replaceChildren(
      streakCard(s),
      h(
        'div',
        { class: 'tiles' },
        tile('Retos jugados', s.played),
        tile('Mejor puntuación', s.bestScore ?? '—', s.perfect > 0 ? `⭐ ${plural(s.perfect, 'perfecto', 'perfectos')}` : null),
        tile('Media', s.averageScore ?? '—'),
        tile('Días ganados', s.wins, s.wins > 0 ? '🏆 1.º en tu liga' : null),
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

function streakCard(s: online.PlayerStats): HTMLElement {
  let status: HTMLElement | null = null;
  if (!s.playedToday) {
    status = h(
      'div',
      { class: 'streak-status' },
      h('span', null, s.currentStreak > 0 ? `Juega hoy para no perder tu racha de ${plural(s.currentStreak, 'día', 'días')}.` : 'Juega el reto de hoy para empezar una racha.'),
      h('button', { class: 'btn small', onclick: openDaily }, 'Jugar'),
    );
  }
  return h(
    'section',
    { class: `card streak-card ${s.currentStreak > 0 ? 'alive' : ''}` },
    h('div', { class: 'streak-flame', 'aria-hidden': 'true' }, '🔥'),
    h(
      'div',
      null,
      h('div', { class: 'streak-number' }, String(s.currentStreak)),
      h('p', { class: 'streak-label' }, s.currentStreak === 1 ? 'día seguido' : 'días seguidos'),
      h('p', { class: 'muted' }, `Mejor racha: ${plural(s.bestStreak, 'día', 'días')}`),
    ),
    status,
  );
}

export function tile(label: string, value: string | number, note: string | null = null): HTMLElement {
  return h('div', { class: 'card tile' }, h('span', { class: 'tile-label' }, label), h('strong', null, String(value)), note ? h('small', null, note) : null);
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Fecha corta: "7 oct". */
function shortDay(day: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)).replace('.', '');
}

/**
 * Columnas con la puntuación de cada día (0-1000). Azul = jugado, dorado = día
 * ganado, punto en la base = no jugado. Tooltip al tocar o pasar por encima, y
 * la misma información en una lista (el dorado tiene poco contraste con el fondo).
 */
export function scoreChart(history: online.PlayerStats['history']): HTMLElement {
  const W = 320;
  const H = 150;
  const pad = { left: 30, right: 6, top: 10, bottom: 22 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / history.length;
  const barW = Math.min(24, slot - 2); // 2 px de aire entre columnas.
  const base = pad.top + plotH;
  const y = (score: number) => base - (score / 1000) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'score-chart', role: 'img', 'aria-label': 'Puntuación de los últimos 30 días' });

  for (const tick of [0, 500, 1000]) {
    svg.append(svgEl('line', { x1: pad.left, x2: W - pad.right, y1: y(tick), y2: y(tick), class: 'grid' }));
    const label = svgEl('text', { x: pad.left - 6, y: y(tick) + 3.5, class: 'tick', 'text-anchor': 'end' });
    label.textContent = tick === 1000 ? '1000' : String(tick);
    svg.append(label);
  }

  const tooltip = h('div', { class: 'chart-tooltip', hidden: true });
  const show = (i: number) => {
    const d = history[i];
    tooltip.replaceChildren(
      h('strong', null, formatDay(d.day)),
      h('span', null, d.score === null ? 'No jugado' : `${d.score} pts${d.won ? ' · 🏆 ganado' : ''}`),
    );
    tooltip.style.left = `${((pad.left + i * slot + slot / 2) / W) * 100}%`;
    tooltip.hidden = false;
    svg.querySelectorAll('.bar.active').forEach((b) => b.classList.remove('active'));
    svg.querySelector(`.bar[data-i="${i}"]`)?.classList.add('active');
  };

  history.forEach((d, i) => {
    const cx = pad.left + i * slot + slot / 2;
    if (d.score === null) {
      svg.append(svgEl('circle', { cx, cy: base, r: 1.6, class: 'missed' }));
    } else {
      const top = Math.min(y(d.score), base - 2); // Una barra de 0 puntos se ve igual.
      const x0 = cx - barW / 2;
      const x1 = cx + barW / 2;
      const r = Math.min(4, barW / 2, base - top);
      svg.append(
        svgEl('path', {
          d: `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z`,
          class: `bar ${d.won ? 'won' : ''}`,
          'data-i': i,
        }),
      );
    }
    // Zona de toque de toda la columna: más grande que la barra.
    const hit = svgEl('rect', { x: pad.left + i * slot, y: pad.top, width: slot, height: plotH + 6, class: 'hit' });
    hit.addEventListener('pointerenter', () => show(i));
    hit.addEventListener('pointerdown', () => show(i));
    svg.append(hit);
  });

  for (const i of [0, Math.floor((history.length - 1) / 2), history.length - 1]) {
    const label = svgEl('text', { x: pad.left + i * slot + slot / 2, y: H - 6, class: 'tick', 'text-anchor': i === 0 ? 'start' : i === history.length - 1 ? 'end' : 'middle' });
    label.textContent = i === history.length - 1 ? 'hoy' : shortDay(history[i].day);
    svg.append(label);
  }

  const chart = h('div', { class: 'chart' }, svg, tooltip);
  chart.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse') tooltip.hidden = true;
  });

  const played = history.filter((d) => d.score !== null);
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'legend' },
      h('span', null, h('i', { class: 'swatch' }), 'Puntuación'),
      h('span', null, h('i', { class: 'swatch won' }), 'Día ganado'),
      h('span', null, h('i', { class: 'swatch missed' }), 'Sin jugar'),
    ),
    chart,
    h(
      'details',
      { class: 'chart-table' },
      h('summary', null, 'Ver los días en una lista'),
      played.length === 0
        ? h('p', { class: 'muted' }, 'Aún no hay retos en estos 30 días.')
        : h(
            'table',
            null,
            h('thead', null, h('tr', null, h('th', null, 'Día'), h('th', null, 'Puntos'), h('th', null, ''))),
            h(
              'tbody',
              null,
              ...[...played].reverse().map((d) => h('tr', null, h('td', null, formatDay(d.day)), h('td', null, String(d.score)), h('td', null, d.won ? '🏆' : ''))),
            ),
          ),
    ),
  );
}
