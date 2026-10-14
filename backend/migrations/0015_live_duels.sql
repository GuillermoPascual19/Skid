-- Duelos en directo (ver common/logic/duels/duels.ts): se sabe quién está en la
-- sala por cuándo avisó por última vez y quién ha pulsado Empezar; cuando están
-- los dos y los dos lo han pulsado, se fija la hora de empezar, la misma para ambos.
ALTER TABLE duels ADD COLUMN challenger_seen_at INTEGER;
ALTER TABLE duels ADD COLUMN opponent_seen_at INTEGER;
ALTER TABLE duels ADD COLUMN challenger_ready_at INTEGER;
ALTER TABLE duels ADD COLUMN opponent_ready_at INTEGER;
-- NULL hasta que empiezan; después, cuándo empieza (tras la cuenta atrás).
ALTER TABLE duels ADD COLUMN starts_at INTEGER;

-- Los duelos que ya se estaban jugando siguen como empezados: cada uno tiene un
-- intento, y quien ya había terminado el tablero se queda con su marca.
UPDATE duels SET starts_at = created_at
WHERE starts_at IS NULL AND declined_at IS NULL
  AND EXISTS (SELECT 1 FROM duel_runs r WHERE r.duel_id = duels.id);
UPDATE duel_runs SET done_at = COALESCE(done_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
WHERE best_moves IS NOT NULL;
