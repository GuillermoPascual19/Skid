// Partida del reto semanal: la pantalla «al mejor intento» (play/attempt-screen.ts)
// enviando cada intento al reto de la semana.

import { golfLabel } from '../../../../common/logic/daily/score';
import { attemptScreen } from '../../play/attempt-screen';
import type { Screen } from '../../shared/router';
import { type WeeklyInfo, finishWeekly } from './api';
import { formatWeek, openWeeklyRanking, weekTitle } from './weekly';
import { t } from '../../i18n/i18n';

export function weeklyScreen(info: WeeklyInfo): Screen {
  let previous = info.run?.overPar ?? null;
  return attemptScreen({
    title: t('weekly.eyebrow'),
    subtitle: weekTitle(info.week),
    eyebrow: `${t('weekly.eyebrow')} · ${formatWeek(info.week)}`,
    rows: info.rows,
    optimal: info.optimal,
    bestOverPar: previous,
    secondary: { label: t('nav.ranking'), onclick: () => void openWeeklyRanking(info.week) },
    async submit(log) {
      const sent = await finishWeekly(info.week, log);
      const best = sent.run.overPar ?? sent.attemptOverPar;
      const note = sent.improved
        ? previous === null
          ? t('weekly.firstMark')
          : t('golf.newBest', { before: golfLabel(previous) })
        : t('golf.keepBest', { best: golfLabel(best) });
      previous = best;
      return {
        bestOverPar: best,
        note,
        highlight: sent.position !== null && sent.total > 1 ? `🏆 ${t('weekly.place', { position: sent.position, total: sent.total })}` : undefined,
      };
    },
  });
}
