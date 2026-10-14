-- Contrarreloj (ver common/logic/timeattack/timeattack.ts). Cada tablero de la
-- semana se genera la primera vez que alguien llega a él y se guarda: generar
-- muchos de golpe no cabe en una petición.
CREATE TABLE time_attack_boards (
  -- Lunes de la semana ("YYYY-MM-DD").
  week TEXT NOT NULL,
  idx INTEGER NOT NULL,
  -- Filas del tablero unidas por '/', en el formato de parseBoard.
  rows TEXT NOT NULL,
  optimal INTEGER NOT NULL,
  PRIMARY KEY (week, idx)
);

-- Cada partida. El servidor reproduce cada tablero al recibirlo y va sumando;
-- la clasificación usa la mejor partida de cada uno en la semana.
CREATE TABLE time_attack_runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  -- Milisegundos desde epoch, con el reloj del servidor. Empieza tras la cuenta atrás.
  started_at INTEGER NOT NULL,
  -- Fin de la partida; cada tablero saltado lo adelanta.
  deadline INTEGER NOT NULL,
  -- Siguiente tablero por jugar y cuándo se terminó (o saltó) el anterior.
  next_idx INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  boards INTEGER NOT NULL DEFAULT 0,
  perfect INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX time_attack_runs_week ON time_attack_runs (week, player_id, score);
