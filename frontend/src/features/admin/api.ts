// Llamadas del panel de administración (backend/src/routes/admin.ts).

import { api } from '../../shared/api';

export interface AdminSummary {
  players: { total: number; named: number; google: number; newToday: number };
  daily: { day: string; finished: number };
  levels: { total: number; reported: number; hidden: number };
  duelsLastWeek: number;
  pushPlayers: number;
}

export interface AdminLevel {
  id: string;
  name: string;
  rows: string[];
  optimal: number;
  createdAt: number;
  authorId: string;
  author: string | null;
  reports: number;
  /** Denuncias por motivo ('name', 'broken', 'other'). */
  reasons: Record<string, number>;
  hidden: boolean;
  plays: number;
  /** Es el nivel destacado. */
  featured: boolean;
}

export interface AdminPlayer {
  id: string;
  name: string | null;
  createdAt: string;
  google: boolean;
  levels: number;
  lastDaily: string | null;
}

export function getAdminSummary(): Promise<AdminSummary> {
  return api('GET', '/admin/summary');
}

export function getAdminLevels(filter: 'reported' | 'all', q: string, offset: number): Promise<{ levels: AdminLevel[]; more: boolean }> {
  const params = new URLSearchParams({ filter, q, offset: String(offset) });
  return api('GET', `/admin/levels?${params}`);
}

export function deleteAdminLevel(id: string): Promise<void> {
  return api('DELETE', `/admin/levels/${encodeURIComponent(id)}`);
}

export function featureLevel(id: string, on: boolean): Promise<void> {
  return api('PUT', `/admin/levels/${encodeURIComponent(id)}/featured`, { on });
}

export function clearLevelReports(id: string): Promise<void> {
  return api('POST', `/admin/levels/${encodeURIComponent(id)}/clear-reports`);
}

export function getAdminPlayers(q: string): Promise<{ players: AdminPlayer[] }> {
  return api('GET', `/admin/players?${new URLSearchParams({ q })}`);
}

export function resetPlayerName(id: string): Promise<void> {
  return api('POST', `/admin/players/${encodeURIComponent(id)}/reset-name`);
}
