// /api/health: lo que mira el servicio de avisos si el juego se cae.
import { beforeEach, expect, it } from 'vitest';
import worker from '../../backend/src/index';
import { health, resetHealth } from '../../backend/src/routes/health';
import { createTestDb, type TestDb } from './d1';

let t: TestDb;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

beforeEach(() => {
  t = createTestDb();
  resetHealth();
});

it('con la base de datos bien: 200, sin sesión', async () => {
  const res = await worker.fetch(new Request('http://localhost/api/health') as Parameters<typeof worker.fetch>[0], t.env, ctx);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, db: 'ok' });
  expect(res.headers.get('Cache-Control')).toBe('no-store');
});

it('si la base de datos falla: 503, y la respuesta se repite un rato sin volver a preguntar', async () => {
  let calls = 0;
  const broken = {
    prepare: () => {
      calls++;
      throw new Error('D1 caída');
    },
  } as unknown as D1Database;
  const res = await health({ DB: broken }, 1_000);
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ ok: false, db: 'error' });
  expect((await health({ DB: broken }, 20_000)).status).toBe(503);
  expect(calls).toBe(1);
  // Pasados 30 s se vuelve a comprobar.
  expect((await health({ DB: t.env.DB }, 40_000)).status).toBe(200);
});
