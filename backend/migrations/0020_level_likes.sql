-- Niveles de la comunidad: «me gusta» (se ve cuántos tiene cada nivel),
-- «guardar» (privado, para jugarlo luego) y el nivel destacado que elige el
-- administrador (el de featured_at más reciente; NULL si no lo está).

CREATE TABLE custom_level_likes (
  level_id TEXT NOT NULL REFERENCES custom_levels (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- Milisegundos desde epoch, con el reloj del servidor.
  created_at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player_id)
);

CREATE INDEX custom_level_likes_player ON custom_level_likes (player_id, created_at);

CREATE TABLE custom_level_saves (
  level_id TEXT NOT NULL REFERENCES custom_levels (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player_id)
);

CREATE INDEX custom_level_saves_player ON custom_level_saves (player_id, created_at);

ALTER TABLE custom_levels ADD COLUMN featured_at INTEGER;
