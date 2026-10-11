-- Niveles de la comunidad (ver src/core/community.ts): los crea un jugador con
-- el editor y los puede jugar y valorar cualquiera.

CREATE TABLE custom_levels (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Filas del tablero unidas por '/', en el formato de parseBoard.
  rows TEXT NOT NULL,
  optimal INTEGER NOT NULL,
  -- Elementos especiales que usa, separados por comas (para mostrarlos en el listado).
  elements TEXT NOT NULL DEFAULT '',
  -- Milisegundos desde epoch, con el reloj del servidor.
  created_at INTEGER NOT NULL
);

CREATE INDEX custom_levels_author ON custom_levels (author_id);
CREATE INDEX custom_levels_created ON custom_levels (created_at);

-- Quién ha superado cada nivel, con su mejor marca y su valoración (1-5).
CREATE TABLE custom_level_runs (
  level_id TEXT NOT NULL REFERENCES custom_levels (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  best_moves INTEGER NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player_id)
);
