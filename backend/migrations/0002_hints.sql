-- Pistas pedidas en el reto diario (cada una resta puntos; ver src/core/score.ts).
-- Las partidas anteriores a las pistas quedan con 0.
ALTER TABLE daily_runs ADD COLUMN hints INTEGER NOT NULL DEFAULT 0;
