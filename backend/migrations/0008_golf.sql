-- Reto diario al estilo golf (ver common/logic/daily/score.ts): el resultado son los
-- golpes (movimientos + pistas) del mejor intento por encima del óptimo.
-- NULL en las partidas de antes, puntuadas con penalizaciones; su `score` se mantiene.
ALTER TABLE daily_runs ADD COLUMN over_par INTEGER;
