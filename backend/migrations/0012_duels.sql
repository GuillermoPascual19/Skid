-- Duelos entre dos jugadores (ver common/logic/duels/duels.ts). El tablero se
-- genera al crear el duelo y se guarda; cada uno tiene hasta expires_at para jugarlo.
CREATE TABLE duels (
  id TEXT PRIMARY KEY,
  challenger_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- NULL mientras es un duelo abierto (por enlace) que nadie ha aceptado.
  opponent_id TEXT REFERENCES players (id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL,
  -- Filas del tablero unidas por '/', en el formato de parseBoard.
  rows TEXT NOT NULL,
  optimal INTEGER NOT NULL,
  -- Milisegundos desde epoch, con el reloj del servidor.
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  -- El rival lo rechazó: el duelo termina sin ganador.
  declined_at INTEGER
);

CREATE INDEX duels_challenger ON duels (challenger_id, created_at);
CREATE INDEX duels_opponent ON duels (opponent_id, created_at);

-- La partida de cada uno: su mejor intento (movimientos, tiempo desde que empezó
-- y el registro, para verlo como fantasma al terminar) y si ya lo ha entregado.
CREATE TABLE duel_runs (
  duel_id TEXT NOT NULL REFERENCES duels (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  best_moves INTEGER,
  best_time_ms INTEGER,
  best_log TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  -- Entregó su marca: ya no juega más. El duelo termina cuando entregan los dos (o a las 48 h).
  done_at INTEGER,
  PRIMARY KEY (duel_id, player_id)
);
