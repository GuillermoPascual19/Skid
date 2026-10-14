// Partida del reto semanal: la pantalla «al mejor intento» (play/attempt-screen.ts)
// enviando cada intento al reto de la semana.

import { golfLabel } from '../../../../common/logic/daily/score';
import { attemptScreen } from '../../play/attempt-screen';
import type { Screen } from '../../shared/router';
import { type WeeklyInfo, finishWeekly } from './api';
import { formatWeek, openWeeklyRanking } from './weekly';

export function weeklyScreen(info: WeeklyInfo): Screen {
  let previous = info.run?.overPar ?? null;
  return attemptScreen({
    title: 'Reto semanal',
    subtitle: `Semana ${formatWeek(info.week)}`,
    eyebrow: `Reto semanal · ${formatWeek(info.week)}`,
    rows: info.rows,
    optimal: info.optimal,
    bestOverPar: previous,
    secondary: { label: 'Ranking', onclick: () => void openWeeklyRanking(info.week) },
    async submit(log) {
      const sent = await finishWeekly(info.week, log);
      const best = sent.run.overPar ?? sent.attemptOverPar;
      const note = sent.improved
        ? previous === null
          ? 'Tu primera marca de la semana. Puedes mejorarla hasta el domingo.'
          : `¡Nueva mejor marca! Antes tenías ${golfLabel(previous)}.`
        : `Te quedas con tu mejor marca: ${golfLabel(best)}.`;
      previous = best;
      return {
        bestOverPar: best,
        note,
        highlight: sent.position !== null && sent.total > 1 ? `🏆 Puesto ${sent.position} de ${sent.total} entre tus amigos` : undefined,
      };
    },
  });
}
