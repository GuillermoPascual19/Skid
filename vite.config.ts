import { defineConfig } from 'vitest/config';

// En desarrollo, /api va al Worker local (`npm run dev:api`, puerto 8787).
const api = { '/api': 'http://localhost:8787' };

export default defineConfig({
  // El juego está en frontend/; se compila a dist/ en la raíz, que es lo que sirve el Worker.
  root: 'frontend',
  // .env.local sigue en la raíz del proyecto (relativo a `root`).
  envDir: '..',
  base: './',
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
