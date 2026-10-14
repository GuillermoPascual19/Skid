// Rellena los huecos {nombre} de un texto traducido.

export type MessageParams = Readonly<Record<string, string | number>>;

export function formatMessage(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}
