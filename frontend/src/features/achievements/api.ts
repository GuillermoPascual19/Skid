// Llamadas al servidor de los logros y gorros.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { AchievementProgress } from '../../../../common/logic/achievements/achievements';

export interface SeasonTitle {
  leagueId: string;
  leagueName: string;
  /** "YYYY-MM". */
  season: string;
  points: number;
  hat: HatId;
}

export interface Achievements {
  hat: HatId | null;
  items: AchievementProgress[];
  /** Temporadas ganadas, de la más reciente a la más antigua. */
  seasons: SeasonTitle[];
}

export function getAchievements(): Promise<Achievements> {
  return api<Achievements>('GET', '/achievements');
}

/** Ponerse un gorro (o quitárselo con null). El servidor comprueba que lo tenga. */
export async function setHat(hat: HatId | null): Promise<void> {
  await api('PUT', '/me/hat', { hat });
}
