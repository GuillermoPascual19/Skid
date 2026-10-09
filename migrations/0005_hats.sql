-- Gorro que lleva el pingüino del jugador (lo desbloquean los logros; ver src/core/achievements.ts).
ALTER TABLE players ADD COLUMN hat TEXT;
