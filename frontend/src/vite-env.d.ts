/// <reference types="vite/client" />

/** Identificador de la compilación del juego (lo pone vite.config.ts). */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** Base de la API del ranking (por defecto "/api"). Vacía: sin ranking online. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
