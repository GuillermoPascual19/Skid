// Huella de los tableros que ya existen: los niveles por debajo del primer
// elemento nuevo y los retos diarios deben salir idénticos para siempre (el
// servidor reproduce las partidas antiguas para verificarlas).

import { describe, expect, it } from 'vitest';
import { dailyLevel, shiftDay } from '../../../src/logic/daily/daily';
import { generateLevel } from '../../../src/logic/engine/generator';
import { hashSeed } from '../../../src/logic/engine/rng';

describe('tableros ya publicados', () => {
  it('niveles 1-14 con varias semillas', () => {
    const rows = [1, 42, 123456789].flatMap((seed) => Array.from({ length: 14 }, (_, i) => generateLevel(i + 1, seed).rows.join('/')));
    expect(hashSeed(rows.join('|')).toString(16)).toBe('40a36d93');
  });

  it('retos diarios', () => {
    const rows = Array.from({ length: 30 }, (_, i) => dailyLevel(shiftDay('2026-09-20', i)).rows.join('/'));
    expect(hashSeed(rows.join('|')).toString(16)).toBe('24c668be');
  });
});
