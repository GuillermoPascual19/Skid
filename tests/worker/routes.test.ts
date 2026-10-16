// El Worker entero (enrutado, sesión y respuesta), no solo las funciones de cada ruta.
import { beforeEach, expect, it } from 'vitest';
import worker from '../../backend/src/index';
import { createTestDb, type TestDb } from './d1';

let t: TestDb;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost/api${path}`, init) as Parameters<typeof worker.fetch>[0], t.env, ctx);

beforeEach(() => {
  t = createTestDb();
});

it('/levels/featured no se confunde con /levels/:id', async () => {
  const { token } = (await (await call('/session', { method: 'POST' })).json()) as { token: string };
  const res = await call('/levels/featured', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ level: null });
});
