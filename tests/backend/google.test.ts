import { beforeAll, describe, expect, it } from 'vitest';
import { InvalidTokenError, verifyGoogleIdToken } from '../../backend/src/google';

const CLIENT_ID = 'skid-test.apps.googleusercontent.com';
const NOW = 1_800_000_000;

let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { kid: string };

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }) {
  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(head));
  return `${head}.${b64url(new Uint8Array(sig))}`;
}

const claims = (extra: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'ana@example.com',
  iat: NOW - 10,
  exp: NOW + 3600,
  ...extra,
});

const keys = async () => [publicJwk as never];
const verify = (token: string) => verifyGoogleIdToken(token, CLIENT_ID, keys, NOW);

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
});

describe('verifyGoogleIdToken', () => {
  it('acepta un token válido y devuelve la cuenta', async () => {
    await expect(verify(await sign(claims()))).resolves.toMatchObject({ sub: '1234567890', email: 'ana@example.com' });
  });

  it('acepta el emisor sin https', async () => {
    await expect(verify(await sign(claims({ iss: 'accounts.google.com' })))).resolves.toMatchObject({ sub: '1234567890' });
  });

  it.each([
    ['de otra aplicación', claims({ aud: 'otra-app' })],
    ['caducado', claims({ exp: NOW - 3600 })],
    ['de otro emisor', claims({ iss: 'https://evil.example.com' })],
    ['sin cuenta', claims({ sub: '' })],
  ])('rechaza un token %s', async (_, payload) => {
    await expect(verify(await sign(payload))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rechaza un token manipulado (firma que no cuadra)', async () => {
    const [h, , s] = (await sign(claims())).split('.');
    const forged = `${h}.${b64url(JSON.stringify(claims({ sub: 'otra-persona' })))}.${s}`;
    await expect(verify(forged)).rejects.toThrow('Firma no válida');
  });

  it('rechaza claves desconocidas y el algoritmo "none"', async () => {
    await expect(verify(await sign(claims(), { alg: 'RS256', kid: 'otra' }))).rejects.toThrow('Clave de firma desconocida');
    const unsigned = `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64url(JSON.stringify(claims()))}.`;
    await expect(verify(unsigned)).rejects.toThrow('Algoritmo no admitido');
  });

  it('rechaza basura', async () => {
    await expect(verify('no-es-un-jwt')).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
