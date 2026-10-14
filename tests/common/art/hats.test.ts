import { expect, it } from 'vitest';
import { isHatId } from '../../../common/art/hats';

it('solo son gorros los de la lista (no lo heredado de Object)', () => {
  expect(isHatId('crown')).toBe(true);
  for (const fake of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', null, 3]) expect(isHatId(fake)).toBe(false);
});
