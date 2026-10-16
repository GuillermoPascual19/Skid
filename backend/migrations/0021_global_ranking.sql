-- Ranking global: todos los jugadores con nombre, por los puntos del reto
-- diario (del mes y de siempre). Quien no quiera salir pone hide_global a 1.

ALTER TABLE players ADD COLUMN hide_global INTEGER NOT NULL DEFAULT 0;

-- Los puntos de un mes se suman por día.
CREATE INDEX daily_runs_day ON daily_runs (day, player_id);
