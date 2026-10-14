import { describe, expect, it } from 'vitest';
import { b64url, encrypt, fromB64url, isPushEndpoint, vapidAuthorization } from '../../backend/src/webpush';

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

describe('notificaciones push', () => {
  it('solo acepta servicios de notificaciones de los navegadores', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(isPushEndpoint('https://evil.example.com/fcm.googleapis.com')).toBe(false);
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
  });

  it('el navegador puede descifrar lo que se le envía (RFC 8291)', async () => {
    // El «navegador»: su par de claves y su secreto.
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const message = JSON.stringify({ title: '⚔️ Ana te reta', body: 'Entra en la sala.' });

    const body = await encrypt(b64url(uaPublic), b64url(auth), new Uint8Array(new TextEncoder().encode(message)));

    // Descifrado como lo hace el navegador, paso a paso según el RFC.
    const salt = body.slice(0, 16);
    const idLength = body[20];
    const asPublic = body.slice(21, 21 + idLength);
    const ciphertext = body.slice(21 + idLength);
    const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
    const prkKey = await hmac(auth, shared);
    const enc = new TextEncoder();
    const ikm = await hmac(prkKey, new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic, 1]));
    const prk = await hmac(salt, ikm);
    const cek = (await hmac(prk, new Uint8Array([...enc.encode('Content-Encoding: aes128gcm\0'), 1]))).slice(0, 16);
    const nonce = (await hmac(prk, new Uint8Array([...enc.encode('Content-Encoding: nonce\0'), 1]))).slice(0, 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));

    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
    expect(plain.at(-1)).toBe(2); // Delimitador de último registro.
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(message);
  });

  it('la firma VAPID se verifica con la clave pública', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const keys = { publicKey: b64url(publicRaw), privateKey: jwk.d! };

    const header = await vapidAuthorization(keys, 'https://fcm.googleapis.com/fcm/send/abc');
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    const [h, c, s] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
    expect(k).toBe(keys.publicKey);
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});
