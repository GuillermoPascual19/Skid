-- Amigos directos: sin liga de por medio. Cada amistad se guarda una vez, con
-- el identificador menor en player_a. Ser amigos da lo mismo que compartir
-- liga: ver el perfil y la partida, retar por nombre y salir en los rankings
-- semanal y de contrarreloj.
CREATE TABLE friendships (
  player_a TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  player_b TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- Milisegundos desde epoch, con el reloj del servidor.
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_a, player_b),
  CHECK (player_a < player_b)
);

CREATE INDEX friendships_b ON friendships (player_b);

-- Solicitudes por nombre, pendientes de que el otro las acepte.
CREATE TABLE friend_requests (
  from_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE INDEX friend_requests_to ON friend_requests (to_id);
