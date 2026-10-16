-- Podio mensual del ranking global (ver backend/src/routes/global.ts). Cada mes
-- se cierra la primera vez que alguien lo consulta después de acabar; los tres
-- primeros se llevan el laurel de oro, plata o bronce.

-- Meses ya cerrados ("YYYY-MM"), tengan podio o no.
CREATE TABLE global_seasons (
  season TEXT PRIMARY KEY,
  settled_at INTEGER NOT NULL
);

CREATE TABLE global_results (
  season TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- 1, 2 o 3 (los empatados comparten puesto).
  position INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (season, player_id)
);

CREATE INDEX global_results_player ON global_results (player_id);
