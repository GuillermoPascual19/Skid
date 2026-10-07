/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API del ranking (por defecto "/api"). Vacía: sin ranking online. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
