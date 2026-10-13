-- Reto semanal (ver common/logic/weekly/weekly.ts). El tablero de cada semana se
-- genera una vez y se guarda: es más grande que el diario y cuesta más generarlo.
CREATE TABLE weekly_boards (
  -- Lunes de la semana ("YYYY-MM-DD").
  week TEXT PRIMARY KEY,
  -- Filas del tablero unidas por '/', en el formato de parseBoard.
  rows TEXT NOT NULL,
  optimal INTEGER NOT NULL
);

-- Partida de cada jugador en cada semana: su mejor intento y cuándo lo consiguió
-- (a igualdad de movimientos gana quien lo consiguió antes).
CREATE TABLE weekly_runs (
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  -- Milisegundos desde epoch, con el reloj del servidor.
  started_at INTEGER NOT NULL,
  best_moves INTEGER,
  best_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, week)
);

CREATE INDEX weekly_runs_week ON weekly_runs (week, best_moves, best_at);
