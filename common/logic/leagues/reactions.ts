// Reacciones al reto diario de un amigo: un emoji de una lista cerrada (sin
// texto libre, así que no hay nada que moderar). Una por amigo y día.

export type ReactionId = 'clap' | 'fire' | 'laugh' | 'wow' | 'strong' | 'penguin';

/** El emoji de cada reacción, en el orden en que se ofrecen. */
export const REACTIONS: Readonly<Record<ReactionId, string>> = {
  clap: '👏',
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  strong: '💪',
  penguin: '🐧',
};

export const REACTION_IDS = Object.keys(REACTIONS) as ReactionId[];

export function isReactionId(value: unknown): value is ReactionId {
  return typeof value === 'string' && (REACTION_IDS as string[]).includes(value);
}

/** Días hacia atrás (contando hoy) en los que aún se puede reaccionar a un reto. */
export const REACTION_DAYS = 7;
