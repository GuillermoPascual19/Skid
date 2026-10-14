// Estadísticas personales del reto diario: racha, totales, calendario y los últimos 30 días.

import { dayKey, shiftDay } from '../../../../common/logic/daily/daily';
import { FREEZE_EVERY, MAX_FREEZES } from '../../../../common/logic/daily/streaks';
import * as online from '../../shared/api';
import { openDaily } from './daily';
import { formatDay, h } from '../../shared/dom';
import { currentName } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import { type PlayerStats, getStats } from './api';
import { intlLocale, t, tn } from '../../i18n/i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function statsScreen(): Screen {
  const subtitle = h('p');
  const body = h('div', { class: 'stats-body' }, h('p', { class: 'empty' }, t('common.loading')));
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('stats.screen.title')), subtitle),
    ),
    body,
  );

  let disposed = false;

  async function load() {
    if (!online.onlineEnabled) {
      body.replaceChildren(h('section', { class: 'card empty' }, t('stats.screen.needsOnline')));
      return;
    }
    try {
      const [stats, name] = await Promise.all([getStats(), currentName().catch(() => null)]);
      if (disposed) return;
      subtitle.textContent = name ? `${t('home.daily.eyebrow')} · ${name}` : t('home.daily.eyebrow');
      render(stats);
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, t('common.retry'))),
      );
    }
  }

  function render(s: PlayerStats) {
    body.replaceChildren(
      streakCard(s),
      h(
        'div',
        { class: 'tiles' },
        tile(t('stats.screen.played'), s.played),
        tile(t('stats.screen.bestScore'), s.bestScore ?? '—', s.perfect > 0 ? `⭐ ${tn('stats.screen.perfect', s.perfect)}` : null),
        tile(t('stats.screen.average'), s.averageScore ?? '—'),
        tile(t('stats.screen.daysWon'), s.wins, s.wins > 0 ? `🏆 ${t('stats.screen.firstInLeague')}` : null),
      ),
      h('section', { class: 'card chart-card' }, h('h2', null, t('stats.screen.calendar')), streakCalendar(s.calendar)),
      h('section', { class: 'card chart-card' }, h('h2', null, t('stats.screen.last30')), scoreChart(s.history)),
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

function streakCard(s: PlayerStats): HTMLElement {
  let status: HTMLElement | null = null;
  if (!s.playedToday) {
    status = h(
      'div',
      { class: 'streak-status' },
      h('span', null, s.currentStreak > 0 ? t('stats.streak.keep', { days: tn('common.days', s.currentStreak) }) : t('stats.streak.start')),
      h('button', { class: 'btn small', onclick: openDaily }, t('common.play')),
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
      h('p', { class: 'streak-label' }, tn('stats.streak.label', s.currentStreak)),
      h('p', { class: 'muted' }, t('stats.streak.best', { days: tn('common.days', s.bestStreak) })),
    ),
    freezeRow(s.freezes ?? 0),
    status,
  );
}

/** Protectores de racha: los que tiene y cómo se ganan. */
function freezeRow(freezes: number): HTMLElement {
  const shields = Array.from({ length: MAX_FREEZES }, (_, i) => h('span', { class: `shield ${i < freezes ? 'on' : ''}` }, '🛡️'));
  return h(
    'div',
    { class: 'freeze-row', title: t('stats.freeze.title') },
    h('span', { class: 'shields', 'aria-hidden': 'true' }, ...shields),
    h(
      'span',
      null,
      h('strong', null, t('stats.freeze.count', { n: freezes, max: MAX_FREEZES })),
      h('small', null, t('stats.freeze.how', { every: FREEZE_EVERY })),
    ),
  );
}

/** Iniciales de los días de la semana, de lunes a domingo, en el idioma del jugador. */
const weekdays = () =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intlLocale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );

/** Primer día del mes de `day`, desplazado `months` meses. */
function monthStart(day: string, months = 0): string {
  const [y, m] = day.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Calendario mensual con los retos jugados (azul), ganados (dorado) y los días
 * salvados por un protector (🛡️). Se puede ir a meses anteriores.
 */
function streakCalendar(calendar: PlayerStats['calendar'] | undefined): HTMLElement {
  const played = new Set(calendar?.played ?? []);
  const won = new Set(calendar?.won ?? []);
  const frozen = new Set(calendar?.frozen ?? []);
  const today = dayKey(new Date());
  const first = monthStart([...played].sort()[0] ?? today);
  const last = monthStart(today);
  let month = last;

  const title = h('strong', { class: 'cal-title' });
  const prev = h('button', { class: 'icon-btn small', 'aria-label': t('stats.calendar.prev') }, '‹');
  const next = h('button', { class: 'icon-btn small', 'aria-label': t('stats.calendar.next') }, '›');
  const grid = h('div', { class: 'cal-grid', role: 'grid' });

  const render = () => {
    const label = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T12:00:00Z`));
    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    prev.disabled = month <= first;
    next.disabled = month >= last;

    const offset = (new Date(`${month}T12:00:00Z`).getUTCDay() + 6) % 7; // Lunes = 0.
    const cells: HTMLElement[] = weekdays().map((d) => h('span', { class: 'cal-head', 'aria-hidden': 'true' }, d));
    for (let i = 0; i < offset; i++) cells.push(h('span', { class: 'cal-day empty' }));
    for (let day = month; day.slice(0, 7) === month.slice(0, 7); day = shiftDay(day, 1)) {
      const state = won.has(day) ? 'won' : played.has(day) ? 'played' : frozen.has(day) ? 'frozen' : day > today ? 'future' : 'missed';
      const text = { won: t('stats.calendar.won'), played: t('stats.calendar.played'), frozen: t('stats.calendar.frozen'), future: '', missed: t('stats.calendar.missed') }[state];
      cells.push(
        h(
          'span',
          { class: `cal-day ${state} ${day === today ? 'today' : ''}`, 'aria-label': text ? `${formatDay(day)}: ${text}` : formatDay(day) },
          state === 'frozen' ? '🛡️' : String(Number(day.slice(8))),
        ),
      );
    }
    grid.replaceChildren(...cells);
  };
  prev.addEventListener('click', () => ((month = monthStart(month, -1)), render()));
  next.addEventListener('click', () => ((month = monthStart(month, 1)), render()));
  render();

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'legend' },
      h('span', null, h('i', { class: 'swatch' }), t('stats.legend.played')),
      h('span', null, h('i', { class: 'swatch won' }), t('stats.legend.won')),
      h('span', null, `🛡️ ${t('stats.legend.freeze')}`),
    ),
    h('div', { class: 'cal-nav' }, prev, title, next),
    grid,
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
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)).replace('.', '');
}

/**
 * Columnas con la puntuación de cada día (0-1000). Azul = jugado, dorado = día
 * ganado, punto en la base = no jugado. Tooltip al tocar o pasar por encima, y
 * la misma información en una lista (el dorado tiene poco contraste con el fondo).
 */
export function scoreChart(history: PlayerStats['history']): HTMLElement {
  const W = 320;
  const H = 150;
  const pad = { left: 30, right: 6, top: 10, bottom: 22 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / history.length;
  const barW = Math.min(24, slot - 2); // 2 px de aire entre columnas.
  const base = pad.top + plotH;
  const y = (score: number) => base - (score / 1000) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'score-chart', role: 'img', 'aria-label': t('stats.chart.label') });

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
      h('span', null, d.score === null ? t('stats.chart.notPlayed') : `${d.score} ${t('common.pts')}${d.won ? ` · 🏆 ${t('stats.calendar.won')}` : ''}`),
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
    label.textContent = i === history.length - 1 ? t('stats.chart.today') : shortDay(history[i].day);
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
      h('span', null, h('i', { class: 'swatch' }), t('stats.legend.score')),
      h('span', null, h('i', { class: 'swatch won' }), t('stats.legend.won')),
      h('span', null, h('i', { class: 'swatch missed' }), t('stats.legend.missed')),
    ),
    chart,
    h(
      'details',
      { class: 'chart-table' },
      h('summary', null, t('stats.chart.asList')),
      played.length === 0
        ? h('p', { class: 'muted' }, t('stats.chart.empty'))
        : h(
            'table',
            null,
            h('thead', null, h('tr', null, h('th', null, t('stats.chart.day')), h('th', null, t('stats.chart.points')), h('th', null, ''))),
            h(
              'tbody',
              null,
              ...[...played].reverse().map((d) => h('tr', null, h('td', null, formatDay(d.day)), h('td', null, String(d.score)), h('td', null, d.won ? '🏆' : ''))),
            ),
          ),
    ),
  );
}
