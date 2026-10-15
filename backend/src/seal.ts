// Cifrado de datos personales en la base de datos (de momento, el email de quien
// entra con Google): AES-GCM con una clave secreta del Worker (EMAIL_KEY). Si
// alguien obtuviera una copia de la base de datos, no vería los emails.
// No depende del Worker: así se puede probar en los tests.

import { b64url, fromB64url } from './webpush';

/** Marca de los valores cifrados (los de antes se guardaron en claro). */
const PREFIX = 'enc1:';

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = fromB64url(secret);
  if (raw.length !== 32) throw new Error('EMAIL_KEY debe tener 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Cifra un texto. Cada vez sale distinto (vector inicial aleatorio). */
export async function seal(secret: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(new TextEncoder().encode(text));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(secret), data));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return PREFIX + b64url(out);
}

/** Descifra lo que guardó `seal`. Un valor de antes (en claro) se devuelve tal cual. Si no se puede, null. */
export async function unseal(secret: string | undefined, stored: string | null): Promise<string | null> {
  if (stored === null) return null;
  if (!isSealed(stored)) return stored;
  if (!secret) return null;
  try {
    const bytes = fromB64url(stored.slice(PREFIX.length));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await importKey(secret), bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
