// Notificaciones push: registrar el service worker (public/sw.js), pedir permiso,
// suscribir este dispositivo con los avisos que quiere y el botón 🔔 de la
// portada con sus ajustes. En iPhone solo funcionan con Skid instalado en la
// pantalla de inicio.

import * as online from '../../shared/api';
import { api } from '../../shared/api';
import { h, openModal, toast } from '../../shared/dom';
import { read, write } from '../../shared/storage';
import { locale, t } from '../../i18n/i18n';

const PREFS_KEY = 'skid.pushPrefs.v1';

export interface PushPrefs {
  duels: boolean;
  friends: boolean;
  reactions: boolean;
  streak: boolean;
}

const DEFAULT_PREFS: PushPrefs = { duels: true, friends: true, reactions: true, streak: true };

/** Lo que se puede hacer con las notificaciones en este dispositivo. */
type PushState = 'unsupported' | 'iosInstall' | 'denied' | 'off' | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function prefs(): PushPrefs {
  return { ...DEFAULT_PREFS, ...(read<Partial<PushPrefs>>(PREFS_KEY) ?? {}) };
}

/** Al arrancar: el service worker que recibirá las notificaciones. */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

async function subscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function state(): Promise<PushState> {
  if (!online.onlineEnabled) return 'unsupported';
  if (isIos() && !isStandalone()) return 'iosInstall';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && (await subscription()) ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/** Pide permiso (si hace falta), suscribe este dispositivo y le dice al servidor qué avisos quiere. */
async function enable(wanted: PushPrefs): Promise<void> {
  const { publicKey } = await api<{ publicKey: string | null }>('GET', '/push/key');
  if (!publicKey) throw new Error(t('notifications.unavailable'));
  if ((await Notification.requestPermission()) !== 'granted') throw new Error(t('notifications.denied'));
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Una suscripción con otra clave (si el servidor la cambió) no sirve: se rehace.
  const key = sub?.options.applicationServerKey;
  if (sub && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api('PUT', '/push/subscription', { subscription: sub.toJSON(), lang: locale(), prefs: wanted });
  write(PREFS_KEY, wanted);
}

async function disable(): Promise<void> {
  const sub = await subscription();
  if (!sub) return;
  await api('DELETE', '/push/subscription', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/**
 * Al abrir el juego con las notificaciones activadas, se le recuerda al servidor
 * la suscripción: así sigue el idioma elegido y la cuenta con la que se juega.
 */
export async function refreshPush(): Promise<void> {
  try {
    if ((await state()) === 'on') await enable(prefs());
  } catch {
    // Sin conexión o sin permiso: ya se intentará la próxima vez.
  }
}

/** Ajustes de las notificaciones: activarlas, qué avisos, una de prueba o desactivarlas. */
export async function openNotifications(onChange?: () => void): Promise<void> {
  const current = await state();
  const wanted = prefs();
  const toggle = (key: keyof PushPrefs, label: string) => {
    const input = h('input', { type: 'checkbox', checked: wanted[key], onchange: () => (wanted[key] = input.checked) });
    return h('label', { class: 'push-toggle' }, input, h('span', null, label));
  };
  const error = h('p', { class: 'error', hidden: true });
  const fail = (err: unknown) => {
    error.textContent = (err as Error).message;
    error.hidden = false;
  };
  const busy = (button: HTMLButtonElement, run: () => Promise<void>) => async () => {
    button.disabled = true;
    error.hidden = true;
    try {
      await run();
    } catch (err) {
      fail(err);
    } finally {
      button.disabled = false;
    }
  };

  const body: (HTMLElement | null)[] = [h('h2', null, `🔔 ${t('notifications.title')}`)];
  if (current === 'unsupported') body.push(h('p', { class: 'lead' }, t('notifications.unsupported')));
  else if (current === 'iosInstall') body.push(h('p', { class: 'lead' }, t('notifications.iosInstall')));
  else if (current === 'denied') body.push(h('p', { class: 'lead' }, t('notifications.denied')));
  else {
    body.push(
      h('p', { class: 'muted' }, t('notifications.text')),
      h(
        'div',
        { class: 'push-toggles' },
        toggle('duels', t('notifications.duels')),
        toggle('friends', t('notifications.friends')),
        toggle('reactions', t('notifications.reactions')),
        toggle('streak', t('notifications.streak')),
      ),
      error,
    );
    if (current === 'off') {
      const on: HTMLButtonElement = h('button', { class: 'btn big block' }, `🔔 ${t('notifications.enable')}`);
      on.addEventListener(
        'click',
        busy(on, async () => {
          await enable(wanted);
          modal.close();
          toast(t('notifications.enabled'));
          onChange?.();
        }),
      );
      body.push(on);
    } else {
      const save: HTMLButtonElement = h('button', { class: 'btn block' }, t('notifications.save'));
      save.addEventListener(
        'click',
        busy(save, async () => {
          await enable(wanted);
          toast(t('notifications.saved'));
        }),
      );
      const test: HTMLButtonElement = h('button', { class: 'btn secondary block' }, t('notifications.test'));
      test.addEventListener(
        'click',
        busy(test, async () => {
          await api('POST', '/push/test');
          toast(t('notifications.testSent'));
        }),
      );
      const off: HTMLButtonElement = h('button', { class: 'link-btn danger' }, t('notifications.disable'));
      off.addEventListener(
        'click',
        busy(off, async () => {
          await disable();
          modal.close();
          toast(t('notifications.disabled'));
          onChange?.();
        }),
      );
      body.push(save, test, off);
    }
  }
  body.push(h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close')));
  const modal = openModal(body, { dismissable: true });
}

/** Botón 🔔 de la portada (🔕 si están desactivadas en este dispositivo). */
export function notificationsButton(): HTMLButtonElement {
  const button: HTMLButtonElement = h('button', { class: 'audio-btn', 'aria-label': t('notifications.title'), title: t('notifications.title') }, '🔔');
  const paint = () => void state().then((s) => (button.textContent = s === 'on' ? '🔔' : '🔕'));
  button.addEventListener('click', () => void openNotifications(paint));
  paint();
  return button;
}

/** En la sala de un duelo, si las notificaciones están apagadas: «Avísame cuando entre». */
export async function duelNotifyHint(): Promise<HTMLElement | null> {
  const s = await state();
  if (s === 'on' || s === 'unsupported') return null;
  return h('button', { class: 'link-btn', onclick: () => void openNotifications() }, `🔔 ${t('notifications.duelHint')}`);
}
