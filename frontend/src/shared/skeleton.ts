// Esqueleto de carga: barras grises con la forma del contenido que va a llegar,
// en lugar de «Cargando…» (se nota menos la espera y no salta la página).

import { h } from './dom';

export function skeleton(lines = 2): HTMLElement {
  return h('div', { class: 'skeleton', 'aria-hidden': 'true' }, ...Array.from({ length: lines }, (_, i) => h('span', { style: `width: ${[70, 90, 50, 80][i % 4]}%` })));
}
