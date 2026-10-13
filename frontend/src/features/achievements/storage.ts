// Logros ya celebrados en este navegador (para celebrar solo los nuevos).

import { read, write } from '../../shared/storage';

const ACHIEVEMENTS_SEEN_KEY = 'skid.achievementsSeen.v1';

export function seenAchievements(): Set<string> {
  return new Set(read<string[]>(ACHIEVEMENTS_SEEN_KEY) ?? []);
}

export function markAchievementsSeen(ids: Iterable<string>): void {
  write(ACHIEVEMENTS_SEEN_KEY, [...new Set([...seenAchievements(), ...ids])]);
}
