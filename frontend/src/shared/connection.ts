// Aviso de que no hay conexión: arriba, en todas las pantallas, mientras dure.
// Sin red se puede seguir jugando al modo libre (el service worker guarda el
// juego); el reto diario, los duelos y los rankings vuelven al volver la red.

import { h } from './dom';
import { t } from '../i18n/i18n';

export function watchConnection(): void {
  const banner = h('div', { class: 'offline-banner', role: 'status', hidden: true }, `📴 ${t('offline.banner')}`);
  document.body.append(banner);
  const update = () => (banner.hidden = navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
