// Llamadas al servidor de los logros y gorros.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { AchievementProgress } from '../../../../common/logic/achievements/achievements';

export interface Achievements {
  hat: HatId | null;
  items: AchievementProgress[];
}

export function getAchievements(): Promise<Achievements> {
  return api<Achievements>('GET', '/achievements');
}

/** Ponerse un gorro (o quitárselo con null). El servidor comprueba que esté desbloqueado. */
export async function setHat(hat: HatId | null): Promise<void> {
  await api('PUT', '/me/hat', { hat });
}
