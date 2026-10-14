-- Notificaciones push (ver backend/src/push.ts). Cada dispositivo que las activa
-- deja aquí su suscripción, su idioma y qué avisos quiere.
CREATE TABLE push_subscriptions (
  -- Dirección del servicio de notificaciones del navegador (Google, Mozilla, Apple…).
  endpoint TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- Claves del navegador para cifrar el contenido (base64url).
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'es',
  duels INTEGER NOT NULL DEFAULT 1,
  reactions INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX push_subscriptions_player ON push_subscriptions (player_id);

-- Último aviso de cada tipo a cada jugador, para no repetirlo (p. ej. «te espera
-- en la sala» como mucho cada 10 minutos).
CREATE TABLE push_log (
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, tag)
);
