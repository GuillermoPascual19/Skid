// Llamadas de los amigos directos (backend/src/routes/friends.ts).

import type { HatId } from '../../../../common/art/hats';
import { api } from '../../shared/api';

export interface FriendPlayer {
  id: string;
  name: string | null;
  hat: HatId | null;
}

export interface Friend extends FriendPlayer {
  /** Su reto de hoy: terminado (con sus movimientos), empezado o sin jugar. */
  today: { status: 'finished' | 'playing' | 'none'; moves: number | null };
}

export interface FriendsOverview {
  /** Tu id, para tu enlace de amigo. */
  me: string;
  friends: Friend[];
  incoming: FriendPlayer[];
  outgoing: FriendPlayer[];
}

export function getFriendsOverview(): Promise<FriendsOverview> {
  return api('GET', '/friends/overview');
}

/** «sent»: le llega la solicitud; «friends»: ya te la había mandado él, así que sois amigos. */
export function requestFriend(name: string): Promise<{ status: 'sent' | 'friends'; name: string }> {
  return api('POST', '/friends/requests', { name });
}

export function acceptFriend(id: string): Promise<void> {
  return api('POST', `/friends/requests/${encodeURIComponent(id)}/accept`);
}

/** Rechaza una solicitud recibida o cancela una enviada. */
export function dropFriendRequest(id: string): Promise<void> {
  return api('DELETE', `/friends/requests/${encodeURIComponent(id)}`);
}

export function removeFriend(id: string): Promise<void> {
  return api('DELETE', `/friends/${encodeURIComponent(id)}`);
}

export function getFriendLink(id: string): Promise<FriendPlayer & { isMe: boolean; already: boolean }> {
  return api('GET', `/friends/link/${encodeURIComponent(id)}`);
}

export function addFriendByLink(id: string): Promise<{ name: string }> {
  return api('POST', `/friends/link/${encodeURIComponent(id)}`);
}

/** Tu enlace de amigo: quien lo abre te añade (tras confirmarlo). */
export function friendLink(me: string): string {
  return `${location.origin}${location.pathname}?amigo=${encodeURIComponent(me)}`;
}
