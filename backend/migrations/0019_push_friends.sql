-- Avisos de amistad (solicitudes y amigos nuevos): activados por defecto, como los demás.
ALTER TABLE push_subscriptions ADD COLUMN friends INTEGER NOT NULL DEFAULT 1;
