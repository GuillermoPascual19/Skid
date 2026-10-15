// Lo poco de Node que usan estos tests (el proyecto no instala @types/node).

/** Vitest corre en Node: import.meta.url es la ruta del archivo. */
interface ImportMeta {
  readonly url: string;
}

declare module 'node:sqlite' {
  export class StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    columns(): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
