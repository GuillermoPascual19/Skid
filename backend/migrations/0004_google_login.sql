-- Login con Google y varias sesiones por jugador (móvil, ordenador...).

-- Sesiones: cada dispositivo tiene su token; un jugador puede tener varias.
-- Se guarda el hash SHA-256 del token, nunca el token.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX sessions_player ON sessions (player_id);

-- Las sesiones que ya existían (una por jugador) pasan a la tabla nueva.
-- players.token_hash se queda como estaba, pero ya no se usa para autenticar.
INSERT INTO sessions (token_hash, player_id) SELECT token_hash, id FROM players;

-- Cuenta de Google vinculada: `sub` es el identificador estable de la cuenta.
ALTER TABLE players ADD COLUMN google_sub TEXT;
ALTER TABLE players ADD COLUMN email TEXT;
CREATE UNIQUE INDEX players_google_sub ON players (google_sub) WHERE google_sub IS NOT NULL;
