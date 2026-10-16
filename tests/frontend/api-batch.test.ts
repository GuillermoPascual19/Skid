// Las lecturas que salen a la vez se agrupan en una sola petición a /batch.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../frontend/src/shared/api';

let calls: string[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { method: string }) => {
      calls.push(`${init.method} ${url}`);
      const path = url.replace(/^\/api/, '');
      if (path === '/session') return Response.json({ token: 'tk' });
      if (path.startsWith('/batch?')) {
        const results: Record<string, unknown> = {};
        for (const p of new URLSearchParams(path.slice('/batch?'.length)).getAll('p')) {
          results[p] = p === '/falla' ? { status: 404, data: { error: 'No existe', code: 'levelNotFound' } } : { status: 200, data: { de: p } };
        }
        return Response.json({ results });
      }
      return Response.json({ suelta: path });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const lecturas = () => calls.filter((c) => !c.includes('/session'));

it('varias lecturas a la vez: una sola petición, y cada una recibe lo suyo', async () => {
  const [a, b, a2] = await Promise.all([api('GET', '/a'), api('GET', '/b?x=1'), api('GET', '/a')]);
  expect(a).toEqual({ de: '/a' });
  expect(a2).toEqual({ de: '/a' }); // La repetida comparte respuesta.
  expect(b).toEqual({ de: '/b?x=1' });
  expect(lecturas()).toEqual([`GET /api/batch?p=${encodeURIComponent('/a')}&p=${encodeURIComponent('/b?x=1')}`]);
});

it('si una del lote falla, solo falla esa', async () => {
  const [ok, falla] = await Promise.allSettled([api('GET', '/a'), api('GET', '/falla')]);
  expect(ok).toEqual({ status: 'fulfilled', value: { de: '/a' } });
  expect(falla).toMatchObject({ status: 'rejected', reason: { message: 'No existe' } });
});

it('una lectura sola va tal cual, y lo que no es lectura nunca se agrupa', async () => {
  expect(await api('GET', '/sola')).toEqual({ suelta: '/sola' });
  await Promise.all([api('POST', '/x', {}), api('PUT', '/y', {})]);
  expect(lecturas()).toEqual(['GET /api/sola', 'POST /api/x', 'PUT /api/y']);
});

it('sin conexión fallan todas con el aviso de siempre', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/session')) return Response.json({ token: 'tk' });
      throw new TypeError('Failed to fetch');
    }),
  );
  const results = await Promise.allSettled([api('GET', '/a'), api('GET', '/b')]);
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
});
