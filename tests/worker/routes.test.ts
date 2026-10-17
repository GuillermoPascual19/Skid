// El Worker entero (enrutado, sesión y respuesta), no solo las funciones de cada ruta.
import { beforeEach, expect, it, vi } from 'vitest';
import worker from '../../backend/src/index';
import { createTestDb, type TestDb } from './d1';

let t: TestDb;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost/api${path}`, init) as Parameters<typeof worker.fetch>[0], t.env, ctx);

/** Cuenta nueva: la cookie de su sesión, tal como la guardaría el navegador. */
async function newSession(): Promise<string> {
  const res = await call('/session', { method: 'POST' });
  return res.headers.get('Set-Cookie')!.split(';')[0];
}

beforeEach(() => {
  t = createTestDb();
});

it('/levels/featured no se confunde con /levels/:id', async () => {
  const cookie = await newSession();
  const res = await call('/levels/featured', { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ level: null });
});

it('/batch responde a varias lecturas a la vez, cada una con su código', async () => {
  const cookie = await newSession();
  const auth = { headers: { Cookie: cookie, 'X-Skid-Lang': 'es' } };
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
  const cookie = await newSession();
  const auth = { headers: { Cookie: cookie } };
  const { results } = (await (await call('/batch?p=/batch?p=/me&p=https://evil.example/x&p=/me', auth)).json()) as { results: Record<string, { status: number }> };
  expect(results['/batch?p=/me'].status).toBe(400);
  expect(results['https://evil.example/x'].status).toBe(400);
  expect(results['/me'].status).toBe(200);
  expect((await call('/batch', auth)).status).toBe(400);
  expect((await call(`/batch?${Array.from({ length: 13 }, () => 'p=/me').join('&')}`, auth)).status).toBe(400);
});

it('no deja ponerse un nombre ofensivo ni crear una liga con uno, y lo explica en su idioma', async () => {
  const cookie = await newSession();
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Skid-Lang': 'es' };
  const bad = await call('/me', { method: 'PUT', headers, body: JSON.stringify({ name: 'Gi1ipo11as' }) });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({ code: 'nameOffensive', error: expect.stringContaining('palabrotas') });
  expect((await call('/me', { method: 'PUT', headers, body: JSON.stringify({ name: 'Pingüino' }) })).status).toBe(200);
  const league = await call('/leagues', { method: 'POST', headers, body: JSON.stringify({ name: 'Liga de m.i.e.r.d.a' }) });
  expect(league.status).toBe(400);
  expect(await league.json()).toMatchObject({ code: 'nameOffensive' });
  expect((await call('/leagues', { method: 'POST', headers, body: JSON.stringify({ name: 'Liga del hielo' }) })).status).toBe(200);
});

it('la sesión va en una cookie HttpOnly y SameSite=Strict, y el token no sale en la respuesta', async () => {
  const res = await call('/session', { method: 'POST' });
  expect(await res.json()).toEqual({ ok: true });
  const cookie = res.headers.get('Set-Cookie')!;
  expect(cookie).toMatch(/^skid=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=31536000$/);
  // En producción (HTTPS), con el prefijo __Host- y Secure.
  const https = await worker.fetch(new Request('https://skid.example/api/session', { method: 'POST' }) as Parameters<typeof worker.fetch>[0], t.env, ctx);
  expect(https.headers.get('Set-Cookie')).toMatch(/^__Host-skid=[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
  expect((await call('/me', { headers: { Cookie: cookie.split(';')[0] } })).status).toBe(200);
  expect((await call('/me', { headers: { Cookie: 'skid=inventado' } })).status).toBe(401);
});

it('los juegos de antes (token en la cabecera) pasan a la cookie sin perder la cuenta', async () => {
  const cookie = await newSession();
  const token = cookie.split('=')[1];
  const res = await call('/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  expect(res.headers.get('Set-Cookie')).toBe(`skid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
  // Con la cookie ya puesta no se repite en cada respuesta.
  expect((await call('/me', { headers: { Cookie: cookie } })).headers.get('Set-Cookie')).toBeNull();
});

it('cerrar sesión borra la cookie y la sesión deja de valer', async () => {
  const cookie = await newSession();
  const res = await call('/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  expect(res.headers.get('Set-Cookie')).toMatch(/^skid=; .*Max-Age=0/);
  expect((await call('/me', { headers: { Cookie: cookie } })).status).toBe(401);
});

it('lo que cambia algo solo vale desde el propio juego, no desde otra web', async () => {
  const cookie = await newSession();
  const put = (origin: string) =>
    call('/me', { method: 'PUT', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Origen' }) });
  expect((await put('https://malvada.example')).status).toBe(403);
  expect((await put('http://localhost')).status).toBe(200);
  // En local, el servidor de Vite va en otro puerto.
  expect((await put('http://localhost:5173')).status).toBe(200);
  expect((await call('/session', { method: 'POST', headers: { Origin: 'https://malvada.example' } })).status).toBe(403);
});

it('con Turnstile configurado, no se crean cuentas sin pasar la comprobación', async () => {
  Object.assign(t.env, { TURNSTILE_SITE_KEY: 'clave-publica', TURNSTILE_SECRET: 'clave-secreta' });
  const verify = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const response = ((init as RequestInit).body as FormData).get('response');
    return Response.json({ success: response === 'buena' });
  });
  try {
    expect(await (await call('/config')).json()).toMatchObject({ turnstileSiteKey: 'clave-publica' });
    const create = (turnstile?: string) =>
      call('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turnstile ? { turnstile } : {}) });
    expect((await create()).status).toBe(403);
    expect((await create('mala')).status).toBe(403);
    const ok = await create('buena');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Set-Cookie')).toMatch(/^skid=/);
    expect(verify).toHaveBeenCalledTimes(2);
  } finally {
    verify.mockRestore();
  }
});
