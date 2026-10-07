import { defineConfig } from 'vitest/config';

// En desarrollo, /api va al Worker local (`npm run dev:api`, puerto 8787).
const api = { '/api': 'http://localhost:8787' };

export default defineConfig({
  base: './',
  server: { proxy: api },
  preview: { proxy: api },
  build: {
    // Phaser ocupa ~1,3 MB minificado por sí solo; se carga aparte, al empezar a jugar.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
