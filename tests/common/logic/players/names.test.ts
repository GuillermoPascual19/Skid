import { describe, expect, it } from 'vitest';
import { nameKey, nameProblem } from '../../../../common/logic/players/names';

describe('nombres de jugador', () => {
  it('admite letras latinas con tildes, números y algunos signos', () => {
    for (const name of ['Ana', 'José Luis', 'Begoña_92', "O'Neill", 'Çelik-2', 'x.y']) expect(nameProblem(name)).toBeNull();
  });

  it('rechaza otros alfabetos (letras que se confunden con las nuestras), emojis y símbolos', () => {
    expect(nameProblem('Аna')).not.toBeNull(); // «А» cirílica.
    expect(nameProblem('Αna')).not.toBeNull(); // «Α» griega.
    expect(nameProblem('Ana🐧')).not.toBeNull();
    expect(nameProblem('<b>Ana</b>')).not.toBeNull();
    expect(nameProblem('-Ana')).not.toBeNull();
  });

  it('controla la longitud', () => {
    expect(nameProblem('A')).not.toBeNull();
    expect(nameProblem('A'.repeat(21))).not.toBeNull();
  });

  it('dos nombres que se ven o se leen igual tienen la misma clave', () => {
    expect(nameKey('José Luis')).toBe(nameKey('jose_luis'));
    expect(nameKey('JOSE-LUIS')).toBe(nameKey('joséluis'));
    expect(nameKey('Ana')).not.toBe(nameKey('Ane'));
  });
});
