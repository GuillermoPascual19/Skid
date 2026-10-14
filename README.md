# Skid

**Español** · [English](README.en.md)

Puzzle de deslizamiento sobre hielo: el pingüino no frena hasta chocar, y hay que recoger las piezas
en orden con el menor número de movimientos. Retos diarios y semanales, duelos y ligas entre amigos,
y niveles creados por los jugadores.

**Juega en <https://skid.gpm-854.workers.dev>**

## Qué tiene

- **Modo libre**: niveles generados cada vez más difíciles, con estrellas según los movimientos y
  elementos que se desbloquean (nieve, corrientes, teletransportes y agujeros).
- **Reto diario**: el mismo tablero para todos; gana quien lo haga en menos movimientos. Con rachas,
  protectores de racha, solución al terminar y el fantasma de un amigo.
- **Reto semanal**: un tablero grande y difícil de lunes a domingo, con ranking entre amigos.
- **Contrarreloj**: 3 minutos para superar tantos tableros como puedas, los mismos para todos durante
  la semana, con ranking entre amigos.
- **Duelos en directo**: retas a un amigo (o a quien quieras con un enlace) y jugáis a la vez el
  mismo tablero nuevo.
- **Ligas**: ranking del día y de la semana con tus amigos, y temporadas mensuales cuyo campeón se
  lleva el gorro de ese mes; reacciones con emojis a los retos de tus amigos; logros que
  desbloquean más gorros.
- **Niveles de jugadores**: editor, publicar (hay que superarlo antes), valorar, ranking por nivel,
  compartir y denunciar.
- Guía «Cómo se juega», modo oscuro, música y efectos sintetizados, y login con Google para jugar en
  varios dispositivos.
- En siete idiomas: español, inglés, alemán, francés, portugués, italiano y ruso. Usa el del
  navegador y se cambia desde el inicio.
- Compartir por WhatsApp o Telegram, copiar el enlace o el mensaje, o el menú del sistema.

## Tecnologías

| Parte | Tecnología |
|---|---|
| Juego | [TypeScript](https://www.typescriptlang.org/) 7 sin framework de interfaz (DOM a mano), [Phaser](https://phaser.io/) 4 para el tablero, [Vite](https://vite.dev/) 8 |
| Sonido | Web Audio API: música y efectos sintetizados en el navegador, sin archivos de audio |
| Servidor | [Cloudflare Workers](https://developers.cloudflare.com/workers/): sirve el juego (static assets) y la API `/api/*` |
| Base de datos | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) con migraciones SQL; Rate Limiting de Workers contra abusos |
| Cuentas | Jugadores anónimos con token; [Iniciar sesión con Google](https://developers.google.com/identity/gsi/web) opcional |
| Tests | [Vitest](https://vitest.dev/) 4 |
| Herramientas | Node 24, [pnpm](https://pnpm.io/) 10, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 4 |
| Despliegue | GitHub Actions: tests, build, migraciones y despliegue en cada merge a `main` |

La lógica del juego (`common/`) es TypeScript puro y la usan los dos lados: el navegador para jugar y
el servidor para reproducir cada partida y comprobar que es válida.

## Desarrollo

Hace falta **Node 24** (ver `.node-version`) y **pnpm** (la versión está en `packageManager` de
`package.json`; con `corepack enable` se instala sola). Por seguridad, `pnpm-workspace.yaml` solo deja
ejecutar scripts de instalación a `esbuild`, `sharp` y `workerd`, y no instala versiones publicadas
hace menos de 3 días.

```sh
pnpm install
pnpm run dev     # juego (Vite, http://localhost:5173) + API con D1 local (Wrangler, :8787)
pnpm test        # tests (Vitest)
pnpm run build   # comprueba tipos y compila a dist/
```

`pnpm run dev:web` arranca solo el juego; el ranking dará error de conexión hasta que la API
esté en marcha. Con `VITE_API_BASE=` vacía en `.env.local` el juego funciona sin ranking online
(por defecto la API está en `/api` del mismo dominio).

## Estructura

Tres partes: el juego (`frontend/`), el servidor (`backend/`) y lo que usan los dos
(`common/`). Dentro, organizado por apartados: para tocar algo, se va a su carpeta.

```
frontend/                  el juego en el navegador (Vite)
  index.html
  public/                  se copia tal cual a dist/
    _headers               cabeceras de seguridad (CSP…) de la web
    theme-init.js          aplica el tema antes de pintar
  src/
    main.ts                arranque y rutas
    style.css              estilos (tema claro y oscuro con variables)
    features/              un apartado por carpeta: pantallas, llamadas al servidor (api.ts)
      home/                y lo que guarda en el navegador (storage.ts)
      free-play/           modo libre
      daily/               reto diario, estadísticas, solución y fantasma de un amigo
      weekly/              reto semanal
      timeattack/          contrarreloj: partida, tarjeta y ranking
      duels/               duelos: retar, sala de espera, partida en directo, resultado y revancha
      ranking/             ligas, temporadas, reacciones y ranking por movimientos (niveles,
                           reto semanal)
      achievements/        logros y gorros
      community/           niveles de jugadores: listado, editor, partida, valorar, denunciar
      profile/             nombre, login con Google, perfil de otros jugadores y cuenta
      guide/               guía «Cómo se juega» y aviso de novedades
    play/                  partida común a todos los modos (pausa, gestos, teclas) y la
                           partida «al mejor intento» (reto semanal y duelos)
    i18n/                  t() para los textos y un diccionario por idioma (locales/)
    game/                  tablero en Phaser: escena, dibujo de casillas, efectos, paleta
    audio/                 música y efectos sintetizados, y sus controles
    shared/                piezas comunes: dom, router, celebración, conexión, almacenamiento y tema
backend/                   el Worker de Cloudflare: sirve el juego (dist/) y la API /api/*
  src/
    index.ts               solo enruta
    http.ts                errores, respuestas y validación de la entrada
    session.ts             sesiones, login con Google, cerrar sesión y borrar la cuenta
    google.ts              verificación de los tokens de Google
    i18n.ts                idioma de cada petición para los mensajes de error
    routes/                un archivo por apartado: daily, weekly, timeattack, duels, leagues,
                           seasons, reactions, levels, players, stats, achievements
  migrations/              esquema de la base de datos D1 (0001 a 0016)
common/                    lo que usan los dos; sin APIs del navegador ni imports de fuera
  logic/                   reglas puras: el servidor reproduce las partidas con este mismo código
    engine/                tablero, movimiento, solver, generador, elementos, aleatorio
    daily/                 reto diario, puntos de liga y rachas
    weekly/                reto semanal
    timeattack/            contrarreloj: tableros de la semana y puntos
    duels/                 duelos: dificultades, tiempos y quién gana
    achievements/          logros
    leagues/               temporadas (fechas, podio y el gorro de cada mes) y reacciones
    community/             validación de niveles creados por jugadores
    players/               reglas de los nombres
  i18n/                    idiomas y mensajes de error del servidor en cada uno
  art/                     dibujos SVG (pingüino, gorros, elementos)
tests/                     backend/ y common/, con el mismo árbol que el código
.github/workflows/         despliegue automático
wrangler.jsonc             configuración del Worker: D1, límites de peticiones, assets
vite.config.ts             Vite y Vitest
pnpm-workspace.yaml        ajustes de seguridad de pnpm
```

`pnpm run build` comprueba los tipos de las tres partes (`common/` sin DOM y sin importar nada de
fuera) y compila el juego a `dist/`.

## Reto diario y puntuación

- El mismo tablero para todos, cambia a medianoche de Madrid.
- El resultado son los movimientos del mejor intento, y cada pista cuenta como uno más: cuantos
  menos, mejor. Volver a empezar es gratis; se puede seguir mejorando todo el día (salvo tras ver la
  solución). A igualdad de movimientos, gana quien tarda menos: el reloj empieza al pulsar *Empezar*
  y no se para.
- Por detrás, para la clasificación semanal y las temporadas, cada reto da puntos: 1000 en el óptimo
  y 100 menos por movimiento de más (mínimo 100). Las constantes están en
  `common/logic/daily/score.ts`. El ranking del día ordena por movimientos (`over_par`), no por
  puntos; los retos de antes de contar por movimientos conservan sus puntos.
- Al terminar se puede ver la solución óptima, jugada por el pingüino.
- El servidor no se fía del cliente: el navegador envía el registro de movimientos y el Worker
  lo reproduce para calcular el mejor intento, el tiempo (con su propio reloj) y los puntos.
- Los jugadores son anónimos: la primera vez el servidor da un token que se guarda en el
  navegador (en la base de datos solo se guarda su hash). Cada uno elige su nombre.

## Reto semanal

- Un tablero más grande y difícil (nivel 30 del modo libre, con nieve y corrientes) de lunes a
  domingo, el mismo para todos. Lo genera el servidor la primera vez que alguien lo pide y lo guarda
  en `weekly_boards`; el juego lo descarga de ahí.
- Se juega cuantas veces se quiera, sin pistas, y cuenta el mejor intento. El ranking es con los
  amigos (quienes comparten alguna liga contigo); a igualdad gana quien lo consiguió antes.
- Lógica en `common/logic/weekly/`, servidor en `backend/src/routes/weekly.ts` y el juego en
  `frontend/src/features/weekly/`.

## Contrarreloj

- 3 minutos para superar tantos tableros pequeños como se pueda, uno detrás de otro y cada vez más
  difíciles (empieza en el nivel 4 del modo libre y sube uno por tablero).
- Cada tablero da 100 puntos más 20 por cada tablero anterior, y 50 de bonus en el óptimo. Se puede
  saltar uno perdiendo 10 s. Reiniciar el tablero se puede, pero el reloj sigue.
- Los tableros de la semana son los mismos para todos. Cada uno se genera la primera vez que alguien
  llega a él y se guarda en `time_attack_boards` (generar muchos de golpe no cabe en una petición).
- El servidor fija la hora de salida (tras 3 s de cuenta atrás) y el final, y reproduce cada tablero
  al recibirlo: comprueba que se ha superado, que no se ha ido más rápido que las animaciones y que
  no se ha acabado el tiempo (con 3 s de margen para la red). Ranking de la semana con los amigos de
  todas tus ligas: cuenta la mejor partida de cada uno.
- Lógica en `common/logic/timeattack/`, servidor en `backend/src/routes/timeattack.ts` y el juego en
  `frontend/src/features/timeattack/`.

## Duelos

- Retas a un amigo de tus ligas o a cualquiera con un enlace (`?duelo=`), y eliges dificultad
  (niveles 6, 12 y 32 del modo libre). El servidor genera el tablero al crear el duelo y lo guarda.
- Son en directo. Los dos esperan en la sala del duelo; mientras está abierta, el juego avisa al
  servidor cada 2 s (`POST /duels/:id/here`). Cuando están los dos y los dos pulsan *Empezar*
  (`PUT /duels/:id/ready`), el servidor fija la hora de empezar, la misma para los dos, tras una
  cuenta atrás de 5 s. Tienen 48 h para coincidir.
- Un intento, sin pistas: se puede reiniciar, pero el reloj sigue. Al terminar se envía y se espera
  al rival; su resultado no se ve hasta que terminan los dos (o pasan 20 minutos). Gana quien haga
  menos movimientos y, a igualdad, quien tardó menos.
- La sala queda en la dirección (`?duelo=`): si el móvil recarga la página al volver de WhatsApp, se
  vuelve a ella.
- Al terminar: el fantasma con los dos intentos y la revancha.
- Lógica en `common/logic/duels/`, servidor en `backend/src/routes/duels.ts` y el juego en
  `frontend/src/features/duels/` (la sala en `duel-room.ts`, la partida en `duel-play.ts`).

## Temporadas

- Cada mes natural es una temporada en cada liga. Gana quien más puntos sume (los mismos del
  ranking) y, a igualdad, quien ganó más días; hace falta que jugaran al menos 2. Un empate en
  cabeza da dos campeones.
- El campeón se lleva el gorro de ese mes (12, uno por mes: `SEASON_HATS`), que solo se consigue
  así. La primera temporada que cuenta es septiembre de 2026.
- No hay tareas programadas: una temporada se cierra la primera vez que alguien de la liga abre
  el juego después de que acabe. El podio se guarda en `season_results` con el nombre de la
  liga, así que el título y el gorro se quedan aunque luego alguien salga o la liga se borre.
- Lógica en `common/logic/leagues/seasons.ts`, servidor en `backend/src/routes/seasons.ts` y el
  juego en la pestaña Temporada del ranking (`frontend/src/features/ranking/season.ts`).

## Seguridad

- Sesiones: token aleatorio de 256 bits en el navegador; en la base de datos solo su hash. Google se
  verifica con su firma, emisor, destinatario y caducidad (`backend/src/google.ts`).
- Todas las consultas SQL van con parámetros. Lo de otros jugadores (nombres, niveles, ligas) se pinta
  siempre como texto, nunca como HTML.
- Permisos: perfiles, partidas (fantasma) y rankings de liga solo entre quienes comparten liga. Unirse
  con un enlace pide confirmación y se puede salir de una liga.
- Límites: 120 peticiones por minuto y jugador a toda la API, cuerpos de 32 KB como mucho, y límites
  propios para crear cuentas, unirse a ligas y publicar niveles (`wrangler.jsonc`).
- Cabeceras: CSP estricta y el resto de cabeceras de seguridad en `frontend/public/_headers`; la API
  pone las suyas en `backend/src/http.ts`.
- Las IP solo se guardan como hash con el día dentro, para contar cuentas nuevas, y se borran a diario.
- Las sesiones caducan tras un año sin usarse. Con la cuenta de Google se puede cerrar sesión en todos
  los dispositivos, y cualquiera puede borrar su cuenta con todos sus datos (sus ligas pasan a otro miembro).
- Nombres: solo alfabeto latino (con tildes y ñ), números y . _ ' -; y no puede haber dos con la misma
  clave (sin tildes, mayúsculas ni separadores), para que nadie se haga pasar por otro
  (`common/logic/players/names.ts`).
- Trampas: el servidor reproduce cada partida y rechaza las imposibles o enviadas sin jugar, pero no
  puede saber si alguien ha calculado la solución por su cuenta (el juego entero corre en el navegador).

## Idiomas

El español (`frontend/src/i18n/locales/es.ts`) es la referencia: los demás diccionarios tienen que
tener las mismas claves, y si falta alguna `pnpm run build` falla. Los plurales llevan `one` y
`other`, y el ruso además `few` y `many`. La lógica compartida no lleva textos: devuelve códigos
(`BoardError`, `nameProblem`…) y cada lado los traduce. El servidor responde los errores en el idioma
de la cabecera `X-Skid-Lang` (o `Accept-Language`). Baloo 2 no tiene cirílico, así que el ruso sale
en Nunito (el navegador solo la descarga si hay texto en cirílico).

## Publicar en Cloudflare

Todo vive en un Worker: el juego (archivos estáticos) y la API, con una base de datos D1.
El plan gratuito sobra para esto.

Primera vez:

1. Crea una cuenta en [cloudflare.com](https://dash.cloudflare.com/sign-up) e inicia sesión desde
   la terminal: `pnpm exec wrangler login`.
2. Crea la base de datos: `pnpm exec wrangler d1 create skid`, y copia el `database_id` que devuelve en
   `wrangler.jsonc`.
3. Publica: `pnpm run deploy`. Aplica las migraciones y despliega; al terminar muestra la URL
   (`https://skid.<tu-subdominio>.workers.dev`).

Despliegue automático en cada push a `main` (`.github/workflows/deploy.yml`, pasa los tests antes):
añade en GitHub, en *Settings → Secrets and variables → Actions*, los secrets
`CLOUDFLARE_API_TOKEN` (créalo en el panel con la plantilla *Edit Cloudflare Workers* y permiso
*D1: Edit*) y `CLOUDFLARE_ACCOUNT_ID`.
