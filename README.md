# Skid

Puzzle de deslizamiento sobre hielo: recoge las piezas en orden con el menor número de movimientos.
Reto diario con ranking entre amigos. Hecho con Phaser + TypeScript + Vite.

## Desarrollo

```sh
npm install
npm run dev     # juego (Vite, http://localhost:5173) + API con D1 local (Wrangler, :8787)
npm test        # tests (Vitest)
npm run build   # comprueba tipos y compila a dist/
```

`npm run dev:web` arranca solo el juego; el ranking dará error de conexión hasta que la API
esté en marcha. Con `VITE_API_BASE=` vacía en `.env.local` el juego funciona sin ranking online
(por defecto la API está en `/api` del mismo dominio).

## Estructura

Organizado por apartados: para tocar algo, se va a la carpeta de ese apartado.

```
src/
  main.ts              arranque y rutas
  logic/               reglas puras, sin navegador; el servidor usa este mismo código
    engine/            tablero, movimiento, solver, generador, elementos, aleatorio
    daily/             reto diario, puntuación y rachas
    achievements/      logros
    community/         validación de niveles creados por jugadores
  features/            un apartado por carpeta: pantallas, llamadas al servidor (api.ts)
    home/              y lo que guarda en el navegador (storage.ts)
    free-play/         modo libre
    daily/             reto diario y estadísticas
    ranking/           ligas
    achievements/      logros y gorros
    community/         multijugador: listado, editor, partida, valorar, denunciar
    profile/           nombre, login con Google y perfil de otros jugadores
  play/                pantalla de partida común a todos los modos (pausa, gestos, teclas)
  game/                tablero en Phaser: escena, dibujo de casillas, efectos
  audio/               música y efectos sintetizados, y sus controles
  art/                 dibujos SVG (pingüino, gorros, elementos)
  shared/              piezas comunes: dom, router, celebración, conexión y almacenamiento
worker/
  index.ts             solo enruta /api/*
  http.ts, session.ts  utilidades comunes y sesiones (incluido login con Google)
  routes/              un archivo por apartado (daily, leagues, levels, stats...)
tests/                 mismo árbol que src/logic/ y worker/
migrations/            esquema de la base de datos D1
```

## Reto diario y puntuación

- El mismo tablero para todos, cambia a medianoche de Madrid.
- Un solo intento por jugador y día. El reloj empieza al pulsar *Empezar* y no se para.
- Puntuación: 1000 menos 25 por movimiento por encima del óptimo, 60 por reintento y 2 por segundo
  por encima del par (3 s por movimiento óptimo, máximo 400). Mínimo 100 por terminar.
  Las constantes están en `src/logic/daily/score.ts`.
- El servidor no se fía del cliente: el navegador envía el registro de movimientos y el Worker
  lo reproduce para calcular movimientos, reintentos, tiempo (con su propio reloj) y puntos.
- Los jugadores son anónimos: la primera vez el servidor da un token que se guarda en el
  navegador (en la base de datos solo se guarda su hash). Cada uno elige su nombre.

## Publicar en Cloudflare

Todo vive en un Worker: el juego (archivos estáticos) y la API, con una base de datos D1.
El plan gratuito sobra para esto.

Primera vez:

1. Crea una cuenta en [cloudflare.com](https://dash.cloudflare.com/sign-up) e inicia sesión desde
   la terminal: `npx wrangler login`.
2. Crea la base de datos: `npx wrangler d1 create skid`, y copia el `database_id` que devuelve en
   `wrangler.jsonc`.
3. Publica: `npm run deploy`. Aplica las migraciones y despliega; al terminar muestra la URL
   (`https://skid.<tu-subdominio>.workers.dev`).

Despliegue automático en cada push a `main` (`.github/workflows/deploy.yml`, pasa los tests antes):
añade en GitHub, en *Settings → Secrets and variables → Actions*, los secrets
`CLOUDFLARE_API_TOKEN` (créalo en el panel con la plantilla *Edit Cloudflare Workers* y permiso
*D1: Edit*) y `CLOUDFLARE_ACCOUNT_ID`.
