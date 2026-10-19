-- Jugadores expulsados de una liga por quien la creó: no pueden volver a unirse
-- con el código (ver backend/src/routes/leagues.ts).

CREATE TABLE league_bans (
  league_id TEXT NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- Milisegundos desde epoch, con el reloj del servidor.
  created_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, player_id)
);
