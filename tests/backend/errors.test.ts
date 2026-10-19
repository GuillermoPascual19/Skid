import { afterEach, describe, expect, it, vi } from 'vitest';
import { logClientError } from '../../backend/src/routes/errors';

const env = (allowed = true) => ({ ERROR_RATE_LIMITER: { limit: async () => ({ success: allowed }) } });
const post = (body: string, ua = 'Navegador de prueba') =>
  new Request('https://skid.test/api/errors', { method: 'POST', body, headers: { 'user-agent': ua, 'cf-connecting-ip': '203.0.113.7' } });

describe('logClientError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('deja el aviso en los logs y responde 204', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await logClientError(
      post(JSON.stringify({ kind: 'rejection', message: 'TypeError: x is undefined', source: '/assets/index.js:1:2', route: 'home', build: 'abc', stack: 'at a\nat b' })),
      env(),
    );
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledWith({
      event: 'clientError',
      kind: 'rejection',
      message: 'TypeError: x is undefined',
      source: '/assets/index.js:1:2',
      route: 'home',
      build: 'abc',
      browser: 'Navegador de prueba',
      stack: 'at a\nat b',
    });
    // Ni la IP ni nada de la cuenta.
    expect(JSON.stringify(log.mock.calls)).not.toContain('203.0.113.7');
  });

  it.each([
    ['JSON roto', '{no'],
    ['null', 'null'],
    ['sin mensaje', JSON.stringify({ kind: 'error' })],
    ['demasiado grande', JSON.stringify({ message: 'x'.repeat(9000) })],
  ])('descarta %s sin quejarse', async (_, body) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await logClientError(post(body), env())).status).toBe(204);
    expect(log).not.toHaveBeenCalled();
  });

  it('pasado el límite no apunta nada', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await logClientError(post(JSON.stringify({ message: 'Error' })), env(false))).status).toBe(204);
    expect(log).not.toHaveBeenCalled();
  });

  it('recorta y quita caracteres de control (salvo saltos de línea)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await logClientError(post(JSON.stringify({ message: `a\u0000b\u200bc${'z'.repeat(400)}`, stack: 'l1\nl2\u0007' })), env());
    const entry = log.mock.calls[0][0] as { message: string; stack: string; kind: string };
    expect(entry.message.startsWith('abc')).toBe(true);
    expect(entry.message.length).toBe(300);
    expect(entry.stack).toBe('l1\nl2');
    expect(entry.kind).toBe('error');
  });
});
