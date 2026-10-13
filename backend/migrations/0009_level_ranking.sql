-- Ranking de cada nivel de la comunidad: a igualdad de movimientos gana quien
-- consiguió antes su mejor marca. `finished_at` cambia en cada partida; esto no.
ALTER TABLE custom_level_runs ADD COLUMN best_at INTEGER;
UPDATE custom_level_runs SET best_at = finished_at;
