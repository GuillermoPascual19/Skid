// Flujo del reto diario: comprobar si ya se jugó, presentar las reglas,
// empezar (con la hora del servidor si hay ranking online), mostrar el resultado
// y seguir mejorándolo o ver la solución.

import { dailyLevel, dayKey, decodeRun, replayRun } from '../../../../common/logic/daily/daily';
import { golfLabel } from '../../../../common/logic/daily/score';
import * as online from '../../shared/api';
import { formatDay, formatTime, h, openModal, plural, share, toast } from '../../shared/dom';
import { celebrate } from '../../shared/celebrate';
import { ensureName } from '../profile/profile';
import { go } from '../../shared/router';
import { type ServerRun, getDaily, startDaily } from './api';
import { type DailyRecord, type DailyResult, loadDaily, saveDaily } from './storage';

export function today(): string {
  return dayKey(new Date());
}

export function resultFromServer(run: ServerRun, optimal: number): DailyResult {
  return {
    moves: run.moves ?? 0,
    retries: run.retries ?? 0,
    hints: run.hints ?? 0,
    timeMs: run.timeMs ?? 0,
    score: run.score ?? 0,
    overPar: run.overPar,
    optimal,
  };
}

/** Guarda aquí el resultado del servidor: pudo jugarse (o mejorarse) en otro dispositivo. */
export function adoptServerResult(day: string, server: ServerRun, record: DailyRecord | null): DailyResult {
  const result = resultFromServer(server, dailyLevel(day).solution.length);
  // Para seguir mejorando, el registro tiene que continuar el que tiene el servidor.
  const log = server.log !== null && !record?.log.startsWith(server.log) ? server.log : (record?.log ?? '');
  saveDaily({ ...record, day, startedAt: server.startedAt, log, result, pendingSubmit: false });
  return result;
}

/** Punto de entrada del botón "Jugar el reto". */
export async function openDaily(): Promise<void> {
  const day = today();
  const record = loadDaily(day);
  // Un intento terminado sin enviar (p. ej. se cerró la página): la partida lo envía al abrirse.
  if (record?.pendingSubmit) return go({ name: 'daily', record });
  if (record?.result) return showDailyResult(day, record.result);

  if (online.onlineEnabled) {
    try {
      if (!(await ensureName())) return;
      const server = await getDaily(day);
      if (server?.finishedAt) {
        return showDailyResult(day, adoptServerResult(day, server, record));
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
        h('li', null, h('b', null, '⛳'), h('span', null, 'Cada movimiento es un golpe. Tu resultado es lo que te pasas del óptimo: «Par» si lo clavas, «+2» con dos de más.')),
        h('li', null, h('b', null, '↺'), h('span', null, 'Volver a empezar es gratis y cuenta tu mejor intento. Puedes seguir mejorándolo durante todo el día.')),
        h('li', null, h('b', null, '💡'), h('span', null, 'Si te atascas, pide una pista: te dice el siguiente movimiento y suma un golpe.')),
        h('li', null, h('b', null, '⏱'), h('span', null, 'El reloj empieza al pulsar Empezar y no se para. A igualdad de golpes, gana quien tarda menos.')),
        h('li', null, h('b', null, '🎯'), h('span', null, 'El mismo tablero para todos tus amigos.')),
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
      if (online.onlineEnabled) startedAt = (await startDaily(day)).startedAt;
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
  const golf = r.overPar ?? null;
  return [
    `🐧 Skid · reto del ${formatDay(day)}`,
    golf !== null ? `⛳ ${golfLabel(golf)}${golf === 0 ? ' 🎯' : ''}` : `⭐ ${r.score} puntos`,
    golf !== null
      ? `🧊 ${r.moves} mov. (óptimo ${r.optimal})${r.hints ? ` · 💡 ${r.hints}` : ''} · ⏱ ${formatTime(r.timeMs)}`
      : `🧊 ${r.moves} mov. (óptimo ${r.optimal}) · ↺ ${r.retries}${r.hints ? ` · 💡 ${r.hints}` : ''} · ⏱ ${formatTime(r.timeMs)}`,
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

/** Se puede seguir mejorando: es el reto de hoy, no está al par y no ha visto la solución. */
export function canImprove(day: string, r: DailyResult): boolean {
  const record = loadDaily(day);
  return day === today() && r.overPar != null && r.overPar > 0 && !!record && !record.solutionSeen;
}

/** Vuelve a la partida para intentarlo otra vez (si el último intento está terminado, empieza otro). */
export function improveDaily(day: string): void {
  const record = loadDaily(day);
  if (!record) return;
  let finished = false;
  try {
    finished = replayRun(dailyLevel(day).board, decodeRun(record.log)).completed;
  } catch {
    // Registro dañado: la partida empezará de cero.
  }
  const next: DailyRecord = { ...record, log: finished ? `${record.log}X` : record.log };
  saveDaily(next);
  go({ name: 'daily', record: next });
}

/** Abre la solución óptima. Si aún podía mejorar el resultado, avisa de que ya no podrá. */
export function openSolution(day: string, r: DailyResult): void {
  if (!canImprove(day, r)) return go({ name: 'solution', day });
  const modal = openModal(
    [
      h('h2', null, '¿Ver la solución?'),
      h('p', { class: 'lead' }, `Si la ves, te quedas con tu ${golfLabel(r.overPar!)} y ya no podrás mejorarlo hoy.`),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              const record = loadDaily(day);
              if (record) saveDaily({ ...record, solutionSeen: true });
              go({ name: 'solution', day });
            },
          },
          'Ver solución',
        ),
      ),
    ],
    { dismissable: true },
  );
}

function golfHeadline(over: number): string {
  if (over === 0) return '¡Al par!';
  if (over === 1) return '¡Casi perfecto!';
  if (over <= 3) return '¡Muy bien!';
  return '¡Completado!';
}

export function showDailyResult(day: string, r: DailyResult, opts: { error?: string; retry?: () => void; note?: string } = {}): void {
  if (r.overPar == null) return showPointsResult(day, r, opts);
  const over = r.overPar;
  const strokes = r.optimal + over;
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `Reto · ${formatDay(day)}`),
      h('h2', null, golfHeadline(over)),
      h('div', { class: `score-big golf${over === 0 ? ' par' : ''}` }, golfLabel(over)),
      opts.note ? h('p', { class: 'golf-note' }, opts.note) : null,
      r.streak ? h('p', { class: 'streak-line' }, `🔥 Racha de ${plural(r.streak, 'día', 'días')}`) : null,
      r.freezeEarned ? h('p', { class: 'freeze-line' }, '🛡️ ¡Protector de racha ganado! Si un día no juegas, tu racha no se rompe.') : null,
      h(
        'div',
        { class: 'breakdown' },
        h('div', null, h('span', null, 'Óptimo'), h('span', null, plural(r.optimal, 'golpe', 'golpes'))),
        h(
          'div',
          null,
          h('span', null, r.hints ? `Tu mejor intento (con ${plural(r.hints, 'pista', 'pistas')})` : 'Tu mejor intento'),
          h('span', null, plural(strokes, 'golpe', 'golpes')),
        ),
        h('div', null, h('span', null, 'Tiempo'), h('span', null, formatTime(r.timeMs))),
        h('div', { class: 'total' }, h('span', null, 'Puntos para la liga'), h('span', null, String(r.score))),
      ),
      opts.error ? h('p', { class: 'error' }, opts.error) : null,
      opts.retry ? h('button', { class: 'btn secondary block', onclick: () => (modal.close(), opts.retry!()) }, 'Reintentar envío') : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => share(shareText(day, r)) }, 'Compartir'),
        h('button', { class: 'btn secondary', onclick: () => go({ name: 'ranking' }) }, 'Ranking'),
      ),
      h(
        'div',
        { class: 'row' },
        canImprove(day, r) ? h('button', { class: 'btn secondary', onclick: () => improveDaily(day) }, '↺ Mejorar') : null,
        h('button', { class: 'btn ghost', onclick: () => openSolution(day, r) }, '👀 Ver solución'),
      ),
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, 'Volver al inicio'),
    ],
    { dismissable: true },
  );
}

/** Resultado de un reto de antes del golf: solo sus puntos. */
function showPointsResult(day: string, r: DailyResult, opts: { error?: string; retry?: () => void }): void {
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `Reto · ${formatDay(day)}`),
      h('h2', null, r.score >= 900 ? '¡Brutal!' : r.score >= 700 ? '¡Muy bien!' : '¡Completado!'),
      h('div', { class: 'score-big' }, String(r.score), h('small', null, 'pts')),
      r.streak ? h('p', { class: 'streak-line' }, `🔥 Racha de ${plural(r.streak, 'día', 'días')}`) : null,
      opts.error ? h('p', { class: 'error' }, opts.error) : null,
      opts.retry ? h('button', { class: 'btn secondary block', onclick: () => (modal.close(), opts.retry!()) }, 'Reintentar envío') : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => share(shareText(day, r)) }, 'Compartir'),
        h('button', { class: 'btn secondary', onclick: () => go({ name: 'ranking' }) }, 'Ranking'),
      ),
      h('button', { class: 'btn ghost block', onclick: () => go({ name: 'solution', day }) }, '👀 Ver solución'),
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, 'Volver al inicio'),
    ],
    { dismissable: true },
  );
}
