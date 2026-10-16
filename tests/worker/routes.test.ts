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

it('/batch responde a varias lecturas a la vez, cada una con su código', async () => {
  const { token } = (await (await call('/session', { method: 'POST' })).json()) as { token: string };
  const auth = { headers: { Authorization: `Bearer ${token}`, 'X-Skid-Lang': 'es' } };
  const res = await call('/batch?p=/me&p=/levels/featured&p=/levels/nada&p=/stats', auth);
  expect(res.status).toBe(200);
  const { results } = (await res.json()) as { results: Record<string, { status: number; data: { code?: string } }> };
  expect(Object.keys(results)).toEqual(['/me', '/levels/featured', '/levels/nada', '/stats']);
  expect(results['/me']).toMatchObject({ status: 200, data: { name: null, admin: false } });
  expect(results['/levels/featured']).toEqual({ status: 200, data: { level: null } });
  // Una que falla no tumba a las demás.
  expect(results['/levels/nada']).toMatchObject({ status: 404, data: { code: 'levelNotFound' } });
  expect(results['/stats'].status).toBe(200);
});

it('/batch: sin sesión no hay nada, y no se aceptan lotes dentro de lotes ni rutas raras', async () => {
  expect((await call('/batch?p=/me')).status).toBe(401);
  const { token } = (await (await call('/session', { method: 'POST' })).json()) as { token: string };
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const { results } = (await (await call('/batch?p=/batch?p=/me&p=https://evil.example/x&p=/me', auth)).json()) as { results: Record<string, { status: number }> };
  expect(results['/batch?p=/me'].status).toBe(400);
  expect(results['https://evil.example/x'].status).toBe(400);
  expect(results['/me'].status).toBe(200);
  expect((await call('/batch', auth)).status).toBe(400);
  expect((await call(`/batch?${Array.from({ length: 13 }, () => 'p=/me').join('&')}`, auth)).status).toBe(400);
});

it('no deja ponerse un nombre ofensivo ni crear una liga con uno, y lo explica en su idioma', async () => {
  const { token } = (await (await call('/session', { method: 'POST' })).json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Skid-Lang': 'es' };
  const bad = await call('/me', { method: 'PUT', headers, body: JSON.stringify({ name: 'Gi1ipo11as' }) });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({ code: 'nameOffensive', error: expect.stringContaining('palabrotas') });
  expect((await call('/me', { method: 'PUT', headers, body: JSON.stringify({ name: 'Pingüino' }) })).status).toBe(200);
  const league = await call('/leagues', { method: 'POST', headers, body: JSON.stringify({ name: 'Liga de m.i.e.r.d.a' }) });
  expect(league.status).toBe(400);
  expect(await league.json()).toMatchObject({ code: 'nameOffensive' });
  expect((await call('/leagues', { method: 'POST', headers, body: JSON.stringify({ name: 'Liga del hielo' }) })).status).toBe(200);
});
