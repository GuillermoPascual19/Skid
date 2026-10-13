-- Reto diario con ranking entre amigos (ligas). Base de datos D1 (SQLite).
-- Solo accede el Worker (worker/index.ts); los clientes pasan siempre por la API.

-- Jugador anónimo: se identifica con un token aleatorio que guarda su navegador.
-- Aquí solo se guarda el hash SHA-256 del token.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE league_members (
  league_id TEXT NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (league_id, player_id)
);

CREATE INDEX league_members_player ON league_members (player_id);

-- Un intento por jugador y día: la clave primaria lo garantiza.
-- Instantes en milisegundos desde epoch, con el reloj del servidor.
CREATE TABLE daily_runs (
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  moves INTEGER,
  retries INTEGER,
  time_ms INTEGER,
  score INTEGER,
  log TEXT,
  PRIMARY KEY (player_id, day)
);
