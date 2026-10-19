-- Código secreto del enlace de amigo de cada jugador (ver backend/src/routes/friends.ts).
-- Antes el enlace llevaba el id del jugador, que ya sale en rankings y niveles: con
-- él cualquiera podía hacerse su amigo sin permiso. Se crea la primera vez que hace falta.

ALTER TABLE players ADD COLUMN friend_code TEXT;

CREATE UNIQUE INDEX players_friend_code ON players (friend_code) WHERE friend_code IS NOT NULL;
