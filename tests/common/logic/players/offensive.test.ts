import { describe, expect, it } from 'vitest';
import { isOffensive } from '../../../../common/logic/players/offensive';
import { nameProblem } from '../../../../common/logic/players/names';

describe('isOffensive', () => {
  it('detecta insultos y palabrotas en los siete idiomas', () => {
    for (const name of ['puta', 'Gilipollas', 'hijo de puta', 'fuck', 'Bitch', 'Arschloch', 'putain', 'caralho', 'cazzo', 'сука', 'хуй', 'blyat', 'Hitler']) {
      expect(isOffensive(name), name).toBe(true);
    }
  });

  it('ve a través de los trucos habituales', () => {
    for (const name of [
      'PUTA',
      'pütá',
      'pu7a',
      'put@',
      'fuuuuck',
      'f u c k',
      'p.u.t.a',
      'p_u_t_a',
      'Fuckboy',
      'xXfuckXx',
      'MotherFucker',
      'mierdaaa',
      'Cu1o',
      'merd4',
      'putas',
      'c4zz0',
    ]) {
      expect(isOffensive(name), name).toBe(true);
    }
  });

  it('no bloquea palabras normales que contienen una mala', () => {
    for (const name of [
      'Computadora',
      'Disputa',
      'Cálculo',
      'Ridículo',
      'Scunthorpe',
      'Essex',
      'Sussex',
      'Ignazio',
      'Análisis',
      'Dickens',
      'Peacock',
      'Cockpit',
      'Grape',
      'Debate',
      'Cazo',
      'Matsushita',
      'Assassin',
      'Classic',
      'Bass',
      'Swank',
      'Técnica',
      'Concha',
      'Débil',
      'Huy',
      'Fica',
      'Clase',
      'Pastel',
      'Montaña',
      'Hielo resbaladizo',
      'Pingüino 92',
      'Ana',
      'José Luis',
      'As de picas',
      'Dutch',
      'Puntaje',
      'Excelente',
      'Arsenal',
      'Скользкий лёд',
      'Дебаты',
      'Небо',
      'Хлеб',
    ]) {
      expect(isOffensive(name), name).toBe(false);
    }
  });
});

describe('nameProblem', () => {
  it('rechaza los nombres ofensivos', () => {
    expect(nameProblem('Gilipollas')).toBe('offensive');
    expect(nameProblem('Ana')).toBeNull();
  });
});
