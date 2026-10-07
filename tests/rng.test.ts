import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '../src/core/rng';

describe('createRng', () => {
  it('es determinista: misma semilla, misma secuencia', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('semillas distintas dan secuencias distintas', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('next() queda en [0, 1) e int() en [min, max]', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const k = rng.int(3, 6);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(6);
      seen.add(k);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('shuffle() devuelve una permutación sin tocar el original', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng(3).shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });
});

describe('hashSeed', () => {
  it('es estable y distingue textos', () => {
    expect(hashSeed('2026-10-06')).toBe(hashSeed('2026-10-06'));
    expect(hashSeed('2026-10-06')).not.toBe(hashSeed('2026-10-07'));
  });
});
