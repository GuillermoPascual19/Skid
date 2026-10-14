-- Reacciones al reto diario de un amigo (ver common/logic/leagues/reactions.ts):
-- una por quien reacciona, a quién y qué día. Cambiarla la sobrescribe.
CREATE TABLE daily_reactions (
  day TEXT NOT NULL,
  from_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- Id de la reacción ('clap', 'fire'…), no el emoji.
  reaction TEXT NOT NULL,
  -- Milisegundos desde epoch: para avisar de las nuevas.
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, from_id, to_id)
);

CREATE INDEX daily_reactions_to ON daily_reactions (to_id, created_at);
