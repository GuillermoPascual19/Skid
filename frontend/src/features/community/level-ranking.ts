// Ranking de un nivel de la comunidad, al estilo golf: menos movimientos y, a
// igualdad, quien lo consiguió antes.

import { openGolfRanking } from '../ranking/golf-ranking';
import { getLevelRanking } from './api';
import { t, tn } from '../../i18n/i18n';

/** Abre el ranking del nivel `id`. */
export function openLevelRanking(id: string, name: string): Promise<void> {
  return openGolfRanking({
    eyebrow: t('levels.ranking.eyebrow'),
    title: name,
    load: () => getLevelRanking(id),
    summary: (r) => t('levels.ranking.summary', { optimal: r.optimal, beaten: tn('levels.ranking.beaten', r.total) }),
    empty: t('levels.ranking.empty'),
  });
}
