// Llamadas al servidor del perfil: tu nombre y gorro, y el perfil de otros jugadores.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { AchievementProgress } from '../../../../common/logic/achievements/achievements';
import type { PlayerStats } from '../daily/api';

export interface Me {
  name: string | null;
  /** Correo de la cuenta de Google vinculada, o null si no hay. */
  email: string | null;
  /** Gorro que lleva el pingüino. */
  hat: HatId | null;
}

export function getMe(): Promise<Me> {
  return api<Me>('GET', '/me');
}

export async function setName(name: string): Promise<void> {
  await api('PUT', '/me', { name });
}

export async function getName(): Promise<string | null> {
  return (await getMe()).name;
}

export interface PlayerProfile {
  name: string | null;
  hat: HatId | null;
  isMe: boolean;
  /** Ligas que tiene en común con quien lo mira. */
  sharedLeagues: string[];
  stats: PlayerStats;
  /** Logros desbloqueados. */
  achievements: AchievementProgress['id'][];
  /** Días que jugasteis los dos (null en tu propio perfil). */
  headToHead: { played: number; myWins: number; theirWins: number; ties: number } | null;
}

/** Perfil de un jugador de tus ligas (o el tuyo). */
export function getPlayer(id: string): Promise<PlayerProfile> {
  return api<PlayerProfile>('GET', `/players/${encodeURIComponent(id)}`);
}
