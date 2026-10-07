-- Cuentas creadas por conexión y día, para limitar la creación masiva de cuentas.
-- Se guarda el hash de la IP, no la IP.
CREATE TABLE session_limits (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
