// Ranking de un nivel de la comunidad, al estilo golf: menos movimientos y, a
// igualdad, quien lo consiguió antes.

import { plural } from '../../shared/dom';
import { openGolfRanking } from '../ranking/golf-ranking';
import { getLevelRanking } from './api';

/** Abre el ranking del nivel `id`. */
export function openLevelRanking(id: string, name: string): Promise<void> {
  return openGolfRanking({
    eyebrow: 'Ranking del nivel',
    title: name,
    load: () => getLevelRanking(id),
    summary: (r) => `Óptimo ${r.optimal} · ${plural(r.total, 'jugador lo ha superado', 'jugadores lo han superado')}. A igualdad, gana quien lo consiguió antes.`,
    empty: 'Nadie lo ha superado todavía.',
  });
}
