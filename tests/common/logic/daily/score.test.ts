import { expect, it } from 'vitest';
import { starsFor } from '../../../../common/logic/daily/score';

it('da estrellas según la distancia al óptimo', () => {
  expect(starsFor(11, 11)).toBe(3);
  expect(starsFor(12, 11)).toBe(2);
  expect(starsFor(13, 11)).toBe(2);
  expect(starsFor(14, 11)).toBe(1);
});
