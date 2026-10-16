import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { LOCALES } from './common/i18n/locales.ts';
import { landingPage, landingPath } from './frontend/landing/template.ts';

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

/** Lo que no hace falta para jugar sin conexión (páginas sueltas, cabeceras, buscadores…). */
const NOT_OFFLINE = /^(_headers|404\.html|sw\.js|version\.json|robots\.txt|sitemap\.xml|og-image\.jpg|legal\/|contact\.js|static\.css|fonts\/OFL-|landing|(es|en|de|fr|pt|it|ru)\/)/;

/** Todos los archivos de dist/ (rutas con /, relativas a dist). */
function distFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? distFiles(full, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

/**
 * Escribe en dist/sw.js la versión y la lista de archivos del juego (ver el
 * service worker): así se puede jugar sin conexión, y cada despliegue cambia
 * sw.js, que es lo que hace que el navegador guarde la versión nueva.
 */
function offlineServiceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'skid-offline',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = distFiles(outDir)
        .filter((f) => !NOT_OFFLINE.test(f))
        .sort();
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8');
      const build = "const BUILD = 'dev';";
      const precache = 'const PRECACHE = [];';
      if (!sw.includes(build) || !sw.includes(precache)) throw new Error('sw.js: no están las líneas de BUILD y PRECACHE');
      writeFileSync(swPath, sw.replace(build, `const BUILD = ${JSON.stringify(BUILD_ID)};`).replace(precache, `const PRECACHE = ${JSON.stringify(files)};`));
    },
  };
}

/**
 * Páginas de presentación para buscadores, una por idioma (/es/, /en/…): HTML
 * ya escrito a partir de frontend/landing/. Al compilar van a dist/; en
 * desarrollo, Vite las sirve sobre la marcha.
 */
function landingPages(): Plugin {
  return {
    name: 'skid-landing',
    generateBundle() {
      for (const locale of LOCALES) this.emitFile({ type: 'asset', fileName: `${locale}/index.html`, source: landingPage(locale) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req as { url?: string }).url; // Sin @types/node: lo único que hace falta.
        const locale = LOCALES.find((l) => url === landingPath(l) || url === `${landingPath(l)}index.html`);
        if (!locale) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(landingPage(locale));
      });
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
  plugins: [versionFile(), landingPages(), offlineServiceWorker()],
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
