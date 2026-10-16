import { expect, it } from 'vitest';
import { DAILY_HINT_LIMIT_SINCE, MAX_HINTS, dailyHintLimit, hintLimit, hintsLeft } from '../../../common/logic/hints';

it('3 pistas, más las que se ganen aparte', () => {
  expect(MAX_HINTS).toBe(3);
  expect(hintLimit()).toBe(3);
  expect(hintLimit(2)).toBe(5);
  expect([0, 1, 3, 5].map((used) => hintsLeft(used))).toEqual([3, 2, 0, 0]);
  expect(hintsLeft(3, 1)).toBe(1);
});

it('el reto diario tiene tope desde DAILY_HINT_LIMIT_SINCE', () => {
  expect(dailyHintLimit(DAILY_HINT_LIMIT_SINCE)).toBe(3);
  expect(dailyHintLimit('2099-01-01')).toBe(3);
  expect(dailyHintLimit('2026-10-01')).toBeNull();
});
