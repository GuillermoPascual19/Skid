-- Temporadas de las ligas (ver common/logic/leagues/seasons.ts). Cada mes se
-- cierra la primera vez que alguien de la liga lo consulta después de acabar.

-- Temporadas ya cerradas de cada liga ("YYYY-MM"), tengan campeón o no.
CREATE TABLE league_seasons (
  league_id TEXT NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, season)
);

-- Podio de cada temporada cerrada. No depende de la liga: el gorro y el título
-- se quedan aunque la liga se borre o alguien salga de ella después. Por eso
-- guarda también el nombre que tenía la liga.
CREATE TABLE season_results (
  league_id TEXT NOT NULL,
  league_name TEXT NOT NULL,
  season TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- 1 es el campeón (puede haber varios si empatan).
  position INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (league_id, season, player_id)
);

CREATE INDEX season_results_player ON season_results (player_id, position);
