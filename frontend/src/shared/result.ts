// El resultado de una partida es el número de movimientos (en el reto diario
// cada pista cuenta como uno más): «20 mov.», o en grande junto al óptimo.

import { h } from './dom';
import { t } from '../i18n/i18n';

export function movesLabel(moves: number): string {
  return t('common.movesShort', { n: moves });
}

/** El resultado en grande; en verde si iguala el óptimo. */
export function movesBig(moves: number, optimal: number): HTMLElement {
  return h('div', { class: `score-big moves${moves <= optimal ? ' perfect' : ''}` }, String(moves), h('small', null, t('common.movesUnit')));
}
