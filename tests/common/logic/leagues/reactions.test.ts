import { describe, expect, it } from 'vitest';
import { REACTIONS, REACTION_IDS, isReactionId } from '../../../../common/logic/leagues/reactions';

describe('reacciones', () => {
  it('hay seis, cada una con su emoji', () => {
    expect(REACTION_IDS).toHaveLength(6);
    expect(new Set(Object.values(REACTIONS)).size).toBe(6);
  });

  it('solo valen las de la lista', () => {
    expect(isReactionId('fire')).toBe(true);
    expect(isReactionId('🔥')).toBe(false);
    expect(isReactionId('constructor')).toBe(false);
    expect(isReactionId(null)).toBe(false);
  });
});
