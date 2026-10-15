// Analíticas sin cookies (Cloudflare Web Analytics): visitas, países y dispositivos,
// sin datos personales ni cookies, así que no hace falta pedir consentimiento. Solo
// se cargan si el servidor tiene un token configurado (CF_ANALYTICS_TOKEN).

import { analyticsToken, onlineEnabled } from './api';

export async function startAnalytics(): Promise<void> {
  if (!onlineEnabled) return;
  try {
    const token = await analyticsToken();
    if (!token) return;
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    // spa: cuenta también los cambios de pantalla dentro del juego.
    script.dataset.cfBeacon = JSON.stringify({ token, spa: true });
    document.head.append(script);
  } catch {
    // Sin analíticas no pasa nada.
  }
}
