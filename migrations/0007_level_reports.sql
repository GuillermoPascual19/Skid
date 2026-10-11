-- Denuncias de niveles de la comunidad. Con REPORTS_TO_HIDE denuncias de
-- jugadores distintos (ver worker/index.ts) el nivel deja de verse, salvo para su autor.

CREATE TABLE custom_level_reports (
  level_id TEXT NOT NULL REFERENCES custom_levels (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- 'name' (nombre ofensivo), 'broken' (no se puede jugar bien) u 'other'.
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player_id)
);
