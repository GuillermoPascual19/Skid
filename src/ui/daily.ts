// Flujo del reto diario: comprobar si ya se jugó, presentar las reglas,
// empezar (con la hora del servidor si hay ranking online) y mostrar el resultado.

import { dailyLevel, dayKey } from '../core/daily';
import { dailyScore, SCORING } from '../core/score';
import * as online from '../services/online';
import { loadDaily, saveDaily, type DailyRecord, type DailyResult } from '../services/storage';
import { formatDay, formatTime, h, openModal, plural, share, toast } from './dom';
import { celebrate } from './celebrate';
import { ensureName } from './profile';
import { go } from './router';

export function today(): string {
  return dayKey(new Date());
}

export function resultFromServer(run: online.ServerRun, optimal: number): DailyResult {
  return {
    moves: run.moves ?? 0,
    retries: run.retries ?? 0,
    hints: run.hints ?? 0,
    timeMs: run.timeMs ?? 0,
    score: run.score ?? 0,
    optimal,
  };
}

/** Punto de entrada del botón "Jugar el reto". */
export async function openDaily(): Promise<void> {
  const day = today();
  const record = loadDaily(day);
  if (record?.result && !record.pendingSubmit) return showDailyResult(day, record.result);

  if (online.onlineEnabled) {
    try {
      if (!(await ensureName())) return;
      const server = await online.getDaily(day);
      if (server?.finishedAt) {
        const result = resultFromServer(server, dailyLevel(day).solution.length);
        saveDaily({ day, startedAt: server.startedAt, log: record?.log ?? '', result });
        return showDailyResult(day, result);
      }
      if (server) {
        // Empezado (en este u otro dispositivo): se continúa con el reloj del servidor.
        const resumed: DailyRecord = { day, startedAt: server.startedAt, log: record?.log ?? '' };
        saveDaily(resumed);
        return go({ name: 'daily', record: resumed });
      }
    } catch (err) {
      return toast((err as Error).message);
    }
  } else if (record) {
    return go({ name: 'daily', record });
  }

  showIntro(day);
}

function showIntro(day: string): void {
  const start = h('button', { class: 'btn big block' }, 'Empezar');
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, 'Reto diario'),
      h('h2', null, formatDay(day)),
      h(
        'ul',
        { class: 'rules' },
        h('li', null, h('b', null, '🎯'), h('span', null, 'Un solo intento. El mismo tablero para todos tus amigos.')),
        h('li', null, h('b', null, '⏱'), h('span', null, 'El reloj empieza al pulsar Empezar y no se para, aunque salgas.')),
        h('li', null, h('b', null, '🧊'), h('span', null, `Cada movimiento por encima del óptimo resta ${SCORING.perExtraMove} puntos.`)),
        h('li', null, h('b', null, '↺'), h('span', null, `Puedes reintentar, pero cada reintento resta ${SCORING.perRetry} y los movimientos se siguen sumando.`)),
        h('li', null, h('b', null, '💡'), h('span', null, `Si te atascas, pide una pista: te dice el siguiente movimiento, pero resta ${SCORING.perHint} puntos.`)),
      ),
      error,
      start,
      h('button', { class: 'link-btn', onclick: () => modal.close() }, 'Ahora no'),
    ],
    { dismissable: true },
  );

  start.addEventListener('click', async () => {
    start.disabled = true;
    try {
      let startedAt = Date.now();
      if (online.onlineEnabled) startedAt = (await online.startDaily(day)).startedAt;
      const record: DailyRecord = { day, startedAt, log: '' };
      saveDaily(record);
      modal.close();
      go({ name: 'daily', record });
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
      start.disabled = false;
    }
  });
}

export function shareText(day: string, r: DailyResult): string {
  const link = `${location.origin}${location.pathname}`;
  return [
    `🐧 Skid · reto del ${formatDay(day)}`,
    `⭐ ${r.score} puntos`,
    `🧊 ${r.moves} mov. (óptimo ${r.optimal}) · ↺ ${r.retries}${r.hints ? ` · 💡 ${r.hints}` : ''} · ⏱ ${formatTime(r.timeMs)}`,
    r.streak && r.streak > 1 ? `🔥 Racha de ${r.streak} días` : null,
    link,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** Rachas que se celebran con confeti al alcanzarlas (y luego cada 100). */
const STREAK_MILESTONES = [7, 14, 30, 50, 100];

function isStreakMilestone(n: number): boolean {
  return STREAK_MILESTONES.includes(n) || (n > 100 && n % 100 === 0);
}

/** Celebración si el reto recién enviado lleva la racha a un hito. Se resuelve al cerrarla. */
export async function celebrateStreak(r: DailyResult): Promise<void> {
  if (!r.streak || !isStreakMilestone(r.streak)) return;
  await celebrate({
    icon: '🔥',
    eyebrow: 'Racha del reto diario',
    title: `¡${r.streak} días seguidos!`,
    text:
      r.streak >= 30
        ? 'Eres constante como un glaciar. Pocos pingüinos llegan tan lejos.'
        : 'Vuelve mañana para que siga creciendo. Cada 7 días ganas un protector de racha 🛡️.',
    button: '¡Seguimos!',
  });
}

/** Penalización del desglose: en rojo solo si resta algo. */
const penalty = (n: number) => h('span', { class: n > 0 ? 'minus' : 'muted' }, n > 0 ? `−${n}` : '0');

export function showDailyResult(day: string, r: DailyResult, opts: { error?: string; retry?: () => void } = {}): void {
  const s = dailyScore({ moves: r.moves, optimal: r.optimal, retries: r.retries, hints: r.hints, timeMs: r.timeMs });
  const scoreEl = h('div', { class: 'score-big' }, '0', h('small', null, 'pts'));
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `Reto · ${formatDay(day)}`),
      h('h2', null, r.score >= 900 ? '¡Brutal!' : r.score >= 700 ? '¡Muy bien!' : '¡Completado!'),
      scoreEl,
      r.streak ? h('p', { class: 'streak-line' }, `🔥 Racha de ${plural(r.streak, 'día', 'días')}`) : null,
      r.freezeEarned ? h('p', { class: 'freeze-line' }, '🛡️ ¡Protector de racha ganado! Si un día no juegas, tu racha no se rompe.') : null,
      h(
        'div',
        { class: 'breakdown' },
        h('div', null, h('span', null, 'Base'), h('span', null, String(SCORING.base))),
        h('div', null, h('span', null, `${plural(r.moves, 'movimiento', 'movimientos')} (óptimo ${r.optimal})`), penalty(s.movePenalty)),
        h('div', null, h('span', null, plural(r.retries, 'reintento', 'reintentos')), penalty(s.retryPenalty)),
        h('div', null, h('span', null, plural(r.hints ?? 0, 'pista', 'pistas')), penalty(s.hintPenalty)),
        h('div', null, h('span', null, `Tiempo ${formatTime(r.timeMs)} (par ${formatTime(s.parSeconds * 1000)})`), penalty(s.timePenalty)),
        h('div', { class: 'total' }, h('span', null, 'Total'), h('span', null, `${r.score} pts`)),
      ),
      opts.error ? h('p', { class: 'error' }, opts.error) : null,
      opts.retry ? h('button', { class: 'btn secondary block', onclick: () => (modal.close(), opts.retry!()) }, 'Reintentar envío') : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => share(shareText(day, r)) }, 'Compartir'),
        h('button', { class: 'btn secondary', onclick: () => go({ name: 'ranking' }) }, 'Ranking'),
      ),
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, 'Volver al inicio'),
    ],
    { dismissable: true },
  );

  // La puntuación sube contando.
  const start = performance.now();
  const animate = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    scoreEl.firstChild!.textContent = String(Math.round(r.score * (1 - Math.pow(1 - t, 3))));
    if (t < 1 && modal.el.isConnected) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}
