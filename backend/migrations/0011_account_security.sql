-- Sesiones que caducan si no se usan (ver backend/src/session.ts) y clave de los
-- nombres para que no haya dos que se vean o se lean igual (ver common/logic/players/names.ts).

-- Último uso de cada sesión (ms desde epoch). Las que ya existen cuentan como usadas hoy.
ALTER TABLE sessions ADD COLUMN last_used_at INTEGER;
UPDATE sessions SET last_used_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

-- Clave del nombre: sin tildes, minúsculas y sin separadores. La calcula el Worker al
-- cambiar el nombre; aquí, para los que ya existen, una aproximación (minúsculas).
ALTER TABLE players ADD COLUMN name_key TEXT;
UPDATE players SET name_key = lower(replace(replace(replace(name, ' ', ''), '_', ''), '-', '')) WHERE name IS NOT NULL;
CREATE INDEX players_name_key ON players (name_key);
