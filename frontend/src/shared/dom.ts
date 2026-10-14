import { intlLocale, t } from '../i18n/i18n';
// Utilidades pequeñas para construir la interfaz sin framework.

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Crea un elemento: h('button', { class: 'btn', onclick: fn }, 'Texto'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key in el) (el as unknown as Props)[key] = value;
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : String(child));
  }
}

/** Interpreta un trozo de SVG fijo (iconos propios, nunca texto del usuario). */
export function svg(markup: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as SVGElement;
}

export interface Modal {
  readonly el: HTMLElement;
  close(): void;
}

/** Abre un modal centrado. `dismissable` permite cerrarlo pulsando fuera o con Escape. */
export function openModal(children: Child[], { dismissable = false, onClose }: { dismissable?: boolean; onClose?: () => void } = {}): Modal {
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  append(modal, children);
  const overlay = h('div', { class: 'overlay' }, modal);

  const onKey = (e: KeyboardEvent) => {
    if (dismissable && e.key === 'Escape') close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  if (dismissable) overlay.addEventListener('pointerdown', (e) => e.target === overlay && close());
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  // Con teclado, el foco va al primer control. En pantallas táctiles solo a los campos de texto
  // (enfocar un botón le pondría el borde de foco sin motivo).
  modal.querySelector<HTMLElement>(isTouch() ? 'input' : 'input, .btn')?.focus();
  return { el: modal, close };
}

export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2500);
}

/**
 * Copia al portapapeles. Algunos navegadores dentro de apps (WhatsApp,
 * Instagram…) bloquean la API moderna: entonces se copia a la antigua.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = h('textarea', { readOnly: true, style: 'position: fixed; opacity: 0; pointer-events: none' });
    area.value = value;
    document.body.append(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** Hoja para compartir: WhatsApp, Telegram, copiar el enlace o el mensaje y, si lo hay, el menú del sistema. */
export function share(text: string): void {
  // El enlace va en la última línea del mensaje (si la hay).
  const lines = text.split('\n');
  const url = /^https?:\/\//.test(lines.at(-1) ?? '') ? lines.at(-1)! : null;
  const message = url ? lines.slice(0, -1).join('\n') : text;

  const copy = async (value: string, done: string) => {
    modal.close();
    toast((await copyText(value)) ? done : t('common.copyFailed'));
  };
  /** Abre la app (o su web) con el mensaje ya escrito. */
  const app = (name: string, label: string, href: string) =>
    h(
      'a',
      { class: `share-option ${name}`, href, target: '_blank', rel: 'noopener noreferrer', onclick: () => modal.close() },
      h('span', { class: 'share-icon', 'aria-hidden': 'true' }, name === 'whatsapp' ? '💬' : '✈️'),
      label,
    );
  const action = (icon: string, label: string, onclick: () => void) =>
    h('button', { class: 'share-option', onclick }, h('span', { class: 'share-icon', 'aria-hidden': 'true' }, icon), label);

  const modal = openModal(
    [
      h('h2', null, t('common.share')),
      h('p', { class: 'share-preview' }, text),
      h(
        'div',
        { class: 'share-options' },
        app('whatsapp', 'WhatsApp', `https://wa.me/?text=${encodeURIComponent(text)}`),
        url ? app('telegram', 'Telegram', `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`) : null,
        url ? action('🔗', t('share.copyLink'), () => void copy(url, t('share.linkCopied'))) : null,
        action('📋', t('share.copyText'), () => void copy(text, t('common.copied'))),
        // El menú del sistema (Instagram, SMS, correo…), donde lo haya.
        'share' in navigator
          ? action('⋯', t('share.more'), () => {
              modal.close();
              navigator.share({ text }).catch(() => {});
            })
          : null,
      ),
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close')),
    ],
    { dismissable: true },
  );
}

// ------------------------------------------------------------------- Móvil

/** Pantalla táctil como entrada principal (móvil o tablet). */
export function isTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Vibración corta (solo Android; en iOS y escritorio no hace nada). */
export function haptic(pattern: number | number[]): void {
  try {
    if (isTouch()) navigator.vibrate?.(pattern);
  } catch {
    // Sin vibración.
  }
}

// ------------------------------------------------------------------ Formato

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "2026-10-06" -> "lunes, 6 de octubre" (en el idioma del jugador). */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** Día anterior a "YYYY-MM-DD". */
export function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Tiempo hasta la próxima medianoche de una zona horaria. */
export function untilMidnight(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const minutesLeft = 24 * 60 - (parts.hour * 60 + parts.minute);
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  return formatDuration(hours, minutes);
}

/** «9 h 7 min», «9 ч 7 мин», «9 Std. 7 Min.»… en el idioma del jugador (sin horas si son 0). */
export function formatDuration(hours: number, minutes: number | null = null): string {
  const unit = (n: number, u: 'hour' | 'minute') => new Intl.NumberFormat(intlLocale(), { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  if (minutes === null) return unit(hours, 'hour');
  return hours > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(minutes, 'minute');
}

// -------------------------------------------------------------------- Iconos

export function starSvg(filled: boolean): SVGElement {
  const fill = filled ? '#ffc93c' : '#d5e3ef';
  const stroke = filled ? '#e48f0c' : '#bccfdf';
  return svg(`
<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M32 4l8.6 17.5 19.3 2.8-14 13.6 3.3 19.2L32 48l-17.2 9.1 3.3-19.2-14-13.6 19.3-2.8z"
        fill="${fill}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
  ${filled ? '<path d="M22 22l6-2" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>' : ''}
</svg>`);
}
