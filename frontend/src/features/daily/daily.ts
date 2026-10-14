// Flujo del reto diario: comprobar si ya se jugó, presentar las reglas,
// empezar (con la hora del servidor si hay ranking online), mostrar el resultado
// y seguir mejorándolo o ver la solución.

import { dailyLevel, dayKey, decodeRun, replayRun } from '../../../../common/logic/daily/daily';
import * as online from '../../shared/api';
import { formatDay, formatTime, h, openModal, share, toast } from '../../shared/dom';
import { movesBig, movesLabel } from '../../shared/result';
import { celebrate } from '../../shared/celebrate';
import { ensureName } from '../profile/profile';
import { openGuide } from '../guide/guide';
import { go } from '../../shared/router';
import { type ServerRun, getDaily, startDaily } from './api';
import { type DailyRecord, type DailyResult, loadDaily, saveDaily } from './storage';
import { t, tn } from '../../i18n/i18n';

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
  const start = h('button', { class: 'btn big block' }, t('daily.intro.start'));
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, t('home.daily.eyebrow')),
      h('h2', null, formatDay(day)),
      h(
        'ul',
        { class: 'rules' },
        h('li', null, h('b', null, '🧊'), h('span', null, t('daily.intro.golf'))),
        h('li', null, h('b', null, '↺'), h('span', null, t('daily.intro.restart'))),
        h('li', null, h('b', null, '💡'), h('span', null, t('daily.intro.hint'))),
        h('li', null, h('b', null, '⏱'), h('span', null, t('daily.intro.clock'))),
        h('li', null, h('b', null, '🎯'), h('span', null, t('daily.intro.same'))),
      ),
      error,
      start,
      h('button', { class: 'link-btn', onclick: () => openGuide('daily') }, t('daily.intro.allRules')),
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.notNow')),
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
  const over = r.overPar ?? null;
  return [
    `🐧 ${t('daily.share.title', { day: formatDay(day) })}`,
    over !== null
      ? `🧊 ${t('daily.share.moves', { n: r.optimal + over, optimal: r.optimal })}${over === 0 ? ' 🎯' : ''}`
      : `⭐ ${t('daily.share.points', { n: r.score })}`,
    over !== null
      ? `${r.hints ? `💡 ${r.hints} · ` : ''}⏱ ${formatTime(r.timeMs)}`
      : `🧊 ${t('daily.share.moves', { n: r.moves, optimal: r.optimal })} · ↺ ${r.retries}${r.hints ? ` · 💡 ${r.hints}` : ''} · ⏱ ${formatTime(r.timeMs)}`,
    r.streak && r.streak > 1 ? `🔥 ${t('daily.share.streak', { days: tn('common.days', r.streak) })}` : null,
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
    eyebrow: t('daily.streak.eyebrow'),
    title: t('daily.streak.title', { n: r.streak }),
    text: r.streak >= 30 ? t('daily.streak.long') : t('daily.streak.short'),
    button: t('daily.streak.button'),
  });
}

/** Se puede seguir mejorando: es el reto de hoy, no está en el óptimo y no ha visto la solución. */
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
      h('h2', null, t('daily.solution.confirmTitle')),
      h('p', { class: 'lead' }, t('daily.solution.confirmText', { result: movesLabel(r.optimal + r.overPar!) })),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.cancel')),
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
          t('daily.solution.see'),
        ),
      ),
    ],
    { dismissable: true },
  );
}

function headline(over: number): string {
  if (over === 0) return t('golf.headline.par');
  if (over === 1) return t('daily.result.almost');
  if (over <= 3) return t('daily.result.veryGood');
  return t('daily.result.done');
}

export function showDailyResult(day: string, r: DailyResult, opts: { error?: string; retry?: () => void; note?: string } = {}): void {
  if (r.overPar == null) return showPointsResult(day, r, opts);
  const over = r.overPar;
  const strokes = r.optimal + over;
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, t('ghost.dailySubtitle', { day: formatDay(day) })),
      h('h2', null, headline(over)),
      movesBig(strokes, r.optimal),
      opts.note ? h('p', { class: 'result-note' }, opts.note) : null,
      r.streak ? h('p', { class: 'streak-line' }, `🔥 ${t('daily.share.streak', { days: tn('common.days', r.streak) })}`) : null,
      r.freezeEarned ? h('p', { class: 'freeze-line' }, `🛡️ ${t('daily.result.freezeEarned')}`) : null,
      h(
        'div',
        { class: 'breakdown' },
        h('div', null, h('span', null, t('stats.optimal')), h('span', null, tn('common.moves', r.optimal))),
        h(
          'div',
          null,
          h('span', null, r.hints ? t('daily.result.bestWithHints', { hints: tn('common.hints', r.hints) }) : t('daily.result.best')),
          h('span', null, tn('common.moves', strokes)),
        ),
        h('div', null, h('span', null, t('stats.time')), h('span', null, formatTime(r.timeMs))),
        h('div', { class: 'total' }, h('span', null, t('daily.result.leaguePoints')), h('span', null, String(r.score))),
      ),
      opts.error ? h('p', { class: 'error' }, opts.error) : null,
      opts.retry ? h('button', { class: 'btn secondary block', onclick: () => (modal.close(), opts.retry!()) }, t('daily.result.retrySend')) : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => share(shareText(day, r)) }, t('common.share')),
        h('button', { class: 'btn secondary', onclick: () => go({ name: 'ranking' }) }, t('nav.ranking')),
      ),
      h(
        'div',
        { class: 'row' },
        canImprove(day, r) ? h('button', { class: 'btn secondary', onclick: () => improveDaily(day) }, `↺ ${t('golf.improve')}`) : null,
        h('button', { class: 'btn ghost', onclick: () => openSolution(day, r) }, `👀 ${t('daily.solution.see')}`),
      ),
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, t('common.backHome')),
    ],
    { dismissable: true },
  );
}

/** Resultado de un reto de antes de contar por movimientos: solo sus puntos. */
function showPointsResult(day: string, r: DailyResult, opts: { error?: string; retry?: () => void }): void {
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, t('ghost.dailySubtitle', { day: formatDay(day) })),
      h('h2', null, r.score >= 900 ? t('daily.result.brutal') : r.score >= 700 ? t('daily.result.veryGood') : t('daily.result.done')),
      h('div', { class: 'score-big' }, String(r.score), h('small', null, t('common.pts'))),
      r.streak ? h('p', { class: 'streak-line' }, `🔥 ${t('daily.share.streak', { days: tn('common.days', r.streak) })}`) : null,
      opts.error ? h('p', { class: 'error' }, opts.error) : null,
      opts.retry ? h('button', { class: 'btn secondary block', onclick: () => (modal.close(), opts.retry!()) }, t('daily.result.retrySend')) : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => share(shareText(day, r)) }, t('common.share')),
        h('button', { class: 'btn secondary', onclick: () => go({ name: 'ranking' }) }, t('nav.ranking')),
      ),
      h('button', { class: 'btn ghost block', onclick: () => go({ name: 'solution', day }) }, `👀 ${t('daily.solution.see')}`),
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, t('common.backHome')),
    ],
    { dismissable: true },
  );
}
