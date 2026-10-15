// D1 de mentira para los tests del Worker: la misma interfaz (prepare, bind,
// first, all, run y batch) sobre una SQLite en memoria de Node, con todas las
// migraciones de backend/migrations aplicadas y las claves foráneas activadas
// (como en D1). Así se prueba el SQL de verdad de las rutas.

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import type { Env } from '../../backend/src/http';
import { nameKey } from '../../common/logic/players/names';

const MIGRATIONS = new URL('../../backend/migrations/', import.meta.url);

/** Ruta de archivo de una URL file:// (en Windows, sin la barra delante de la unidad). */
const filePath = (url: URL) => decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1');

/** D1 convierte los booleanos en 0/1 y no admite undefined. */
function toSql(value: unknown): unknown {
  if (value === undefined) throw new Error('D1 no admite undefined');
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params.map(toSql));
  }

  private stmt(): StatementSync {
    return this.db.prepare(this.sql);
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.stmt().get(...this.params);
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: { changes: number } }> {
    // Las sentencias que no devuelven filas (INSERT, UPDATE…) también pueden ir por all().
    if (!this.returnsRows()) {
      const r = this.stmt().run(...this.params);
      return { results: [], success: true, meta: { changes: Number(r.changes) } };
    }
    const results = this.stmt()
      .all(...this.params)
      .map((r) => ({ ...r }) as T);
    return { results, success: true, meta: { changes: 0 } };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const r = this.stmt().run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }

  private returnsRows(): boolean {
    return this.stmt().columns().length > 0;
  }
}

export interface TestDb {
  readonly db: DatabaseSync;
  readonly env: Env;
  /** Ejecuta SQL directo (para preparar datos). */
  exec(sql: string): void;
  /** Filas de una consulta directa. */
  rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
}

/** Base de datos nueva con todas las migraciones y un Env de pruebas (limitadores siempre a favor). */
export function createTestDb(): TestDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(filePath(MIGRATIONS))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(filePath(new URL(file, MIGRATIONS)), 'utf8'));
  }
  const DB = {
    prepare: (sql: string) => new Statement(db, sql),
    // D1 ejecuta el lote en una transacción: si algo falla, no se aplica nada.
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.all());
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
  const allow = { limit: async () => ({ success: true }) };
  const env = {
    DB,
    SESSION_RATE_LIMITER: allow,
    JOIN_RATE_LIMITER: allow,
    API_RATE_LIMITER: allow,
    ERROR_RATE_LIMITER: allow,
    waitUntil: () => {},
  } as unknown as Env;
  return {
    db,
    env,
    exec: (sql) => db.exec(sql),
    rows: <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params.map(toSql)) as T[],
  };
}

/** Crea un jugador (con nombre si se da) y devuelve su id. */
export function addPlayer(t: TestDb, id: string, name: string | null = null, extra: { googleSub?: string } = {}): string {
  const key = name ? nameKey(name) : null;
  t.db.prepare('INSERT INTO players (id, token_hash, name, name_key, google_sub) VALUES (?, ?, ?, ?, ?)').run(id, `hash-${id}`, name, key, extra.googleSub ?? null);
  return id;
}
