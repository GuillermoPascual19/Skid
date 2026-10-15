import { describe, expect, it } from 'vitest';
import { isSealed, seal, unseal } from '../../backend/src/seal';
import { b64url } from '../../backend/src/webpush';

const key = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

describe('cifrado del email en la base de datos', () => {
  it('se recupera con la misma clave y no se ve en lo guardado', async () => {
    const k = key();
    const stored = await seal(k, 'ana@example.com');
    expect(isSealed(stored)).toBe(true);
    expect(stored).not.toContain('ana');
    expect(await unseal(k, stored)).toBe('ana@example.com');
  });

  it('el mismo email cifrado dos veces sale distinto', async () => {
    const k = key();
    expect(await seal(k, 'ana@example.com')).not.toBe(await seal(k, 'ana@example.com'));
  });

  it('con otra clave (o sin clave) no se puede leer', async () => {
    const stored = await seal(key(), 'ana@example.com');
    expect(await unseal(key(), stored)).toBeNull();
    expect(await unseal(undefined, stored)).toBeNull();
  });

  it('los emails de antes (en claro) se siguen leyendo hasta que se cifran', async () => {
    expect(await unseal(key(), 'viejo@example.com')).toBe('viejo@example.com');
    expect(await unseal(key(), null)).toBeNull();
  });

  it('rechaza una clave que no es de 32 bytes', async () => {
    await expect(seal(b64url(new Uint8Array(16)), 'x')).rejects.toThrow();
  });
});
