import { defineConfig, type Plugin } from 'vitest/config';

/** Identificador de esta compilación: va dentro del juego y en dist/version.json. */
const BUILD_ID = new Date().toISOString();

/**
 * Deja dist/version.json con el identificador de la compilación: el juego lo
 * consulta para saber si se ha desplegado una versión nueva (ver shared/update.ts).
 */
function versionFile(): Plugin {
  return {
    name: 'skid-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

// En desarrollo, /api va al Worker local (`npm run dev:api`, puerto 8787).
const api = { '/api': 'http://localhost:8787' };

export default defineConfig({
  // El juego está en frontend/; se compila a dist/ en la raíz, que es lo que sirve el Worker.
  root: 'frontend',
  // .env.local sigue en la raíz del proyecto (relativo a `root`).
  envDir: '..',
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [versionFile()],
  server: { proxy: api },
  preview: { proxy: api },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Phaser ocupa ~1,3 MB minificado por sí solo; se carga aparte, al empezar a jugar.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    // Los tests están en tests/, en la raíz (relativo a donde se lanza vitest).
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
