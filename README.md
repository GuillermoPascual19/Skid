# Skid

**Español** · [English](README.en.md)

Puzzle de deslizamiento sobre hielo: el pingüino no frena hasta chocar, y hay que recoger las piezas
en orden con el menor número de movimientos. Retos diarios y semanales, duelos y ligas entre amigos,
y niveles creados por los jugadores.

**Juega en <https://skid.gpm-854.workers.dev>**

## Qué tiene

- **Organización**: cuatro pestañas abajo: Hoy (reto diario, semanal y contrarreloj), Jugar (modo libre,
  niveles de jugadores, tutorial), Amigos (amigos, duelos, ligas) y Tú (logros, estadísticas, ajustes, cuenta).
  Cada tarjeta enseña al instante lo último que se vio mientras llega lo nuevo (`shared/cache.ts`).
- **Tutorial**: la primera vez se aprende jugando, con tres tableros guiados (y desde la guía de reglas).
- **Modo libre**: niveles generados cada vez más difíciles, con estrellas según los movimientos y
  elementos que se desbloquean (nieve, corrientes, teletransportes, agujeros, hielo frágil, espejos,
  pasos de un sentido, interruptores con puertas y bloques empujables).
- **Reto diario**: el mismo tablero para todos; gana quien lo haga en menos movimientos. Con rachas,
  protectores de racha, solución al terminar y el fantasma de un amigo.
- **Reto semanal**: un tablero grande y difícil de lunes a domingo, con ranking entre amigos.
- **Contrarreloj**: 3 minutos para superar tantos tableros como puedas, los mismos para todos durante
  la semana, con ranking entre amigos.
- **Duelos en directo**: retas a un amigo (o a quien quieras con un enlace) y jugáis a la vez el
  mismo tablero nuevo.
- **Amigos**: añadir a alguien por su nombre (con solicitud) o con tu enlace de amigo, sin necesidad
  de liga; ves su reto del día, su perfil y su partida, y le retas a un duelo.
- **Ligas**: ranking del día y de la semana con tus amigos, y temporadas mensuales cuyo campeón se
  lleva el gorro de ese mes; reacciones con emojis a los retos de tus amigos; logros del reto
  diario, duelos, contrarreloj, reto semanal y niveles de la comunidad que desbloquean más gorros.
  Quien crea una liga la gestiona: puede expulsar a alguien y cambiar el código.
- **Ranking global**: todos los jugadores por los puntos del reto diario, del mes y desde siempre (quien
  no quiera salir lo desactiva en la pestaña Tú). Cada mes, los tres primeros se llevan el laurel mundial
  de oro, plata o bronce.
- **Niveles de jugadores**: editor, publicar (hay que superarlo antes), valorar, ❤️ me gusta y 🔖 guardar
  (con sus filtros), ranking por nivel, compartir y denunciar. El administrador elige un nivel destacado,
  que sale en la pestaña Jugar.
- Guía «Cómo se juega», modo oscuro, música y efectos sintetizados, y login con Google para jugar en
  varios dispositivos.
- Se instala como app y avisa con notificaciones (duelos, amigos, reacciones y recordatorio de racha).
  Sin conexión se puede seguir jugando al modo libre y al tutorial.
- En siete idiomas: español, inglés, alemán, francés, portugués, italiano y ruso. Usa el del
  navegador y se cambia desde el inicio.
- Compartir por WhatsApp o Telegram, copiar el enlace o el mensaje, o el menú del sistema.
- **Portada para buscadores**: una página estática por idioma (`/es/`, `/en/`…) con capturas, qué tiene,
  cómo se juega y preguntas frecuentes, generada al compilar (`frontend/landing/`) y en el sitemap.

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
    sw.js                  service worker: muestra las notificaciones
    manifest.webmanifest   app instalable (con sus iconos)
    landing/, landing.css  capturas y estilos de la portada para buscadores
  landing/                 portada para buscadores: textos de cada idioma y su HTML (se genera al compilar)
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
      ranking/             ligas (y gestionarlas), temporadas, reacciones, ranking global con su
                           premio y ranking por movimientos (niveles, reto semanal)
      achievements/        logros y gorros
      community/           niveles de jugadores: listado, editor, partida, valorar, denunciar
      profile/             nombre, login con Google, perfil de otros jugadores y cuenta
      guide/               guía «Cómo se juega» y aviso de novedades
      tabs/                pestañas Jugar y Tú
      friends/             amigos: lista, solicitudes y enlace de amigo
      notifications/       activar las notificaciones y elegir cuáles
      admin/               panel de administración
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
    session.ts             sesiones (en cookie HttpOnly), login con Google, cerrar sesión y borrar la cuenta
    turnstile.ts           comprobar que es una persona al crear una cuenta
    seal.ts                cifrado del email
    google.ts              verificación de los tokens de Google
    i18n.ts                idioma de cada petición para los mensajes de error
    push.ts                notificaciones: a quién, en qué idioma y sin repetir
    webpush.ts             cifrado y firma VAPID de las notificaciones (sin librerías)
    routes/                un archivo por apartado: daily, weekly, timeattack, duels, leagues,
                           seasons, global, reactions, levels, players, friends, stats, achievements,
                           push, errors, admin, health
  migrations/              esquema de la base de datos D1 (0001 a 0023)
common/                    lo que usan los dos; sin APIs del navegador ni imports de fuera
  logic/                   reglas puras: el servidor reproduce las partidas con este mismo código
    engine/                tablero, movimiento, solver, generador, elementos, aleatorio
    daily/                 reto diario, puntos de liga y rachas
    weekly/                reto semanal
    timeattack/            contrarreloj: tableros de la semana y puntos
    duels/                 duelos: dificultades, tiempos y quién gana
    achievements/          logros
    leagues/               temporadas (fechas, podio y el gorro de cada mes), podio del ranking global
                           y reacciones
    community/             validación de niveles creados por jugadores
    players/               reglas de los nombres y filtro de insultos
  i18n/                    idiomas, mensajes de error y textos de las notificaciones
  art/                     dibujos SVG (pingüino, gorros, elementos)
tests/                     backend/ y common/, con el mismo árbol que el código; worker/ prueba las
                           rutas con su SQL real sobre una SQLite en memoria (node:sqlite) con las migraciones
.github/workflows/         comprobación de cada PR, despliegue automático y copia de seguridad semanal
wrangler.jsonc             configuración del Worker: D1, límites de peticiones, assets
vite.config.ts             Vite y Vitest
pnpm-workspace.yaml        ajustes de seguridad de pnpm
```

`pnpm run build` comprueba los tipos de las tres partes (`common/` sin DOM y sin importar nada de
fuera) y compila el juego a `dist/`.

## Reto diario y puntuación

- El mismo tablero para todos, cambia a medianoche de Madrid.
- El resultado son los movimientos del mejor intento, y cada pista cuenta como uno más (como mucho
  3 pistas al día; en el modo libre, 3 por nivel; ver `common/logic/hints.ts`): cuantos
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
- Los jugadores son anónimos: la primera vez el servidor crea una sesión y la guarda en una cookie
  del navegador (en la base de datos solo se guarda su hash). Cada uno elige su nombre.

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
- Cada tablero da 100 puntos más 20 por cada tablero ya superado (los saltados no cuentan), y 50 de
  bonus en el óptimo. Se puede
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

## Notificaciones

- Avisos push aunque el juego esté cerrado: te retan a un duelo, han aceptado tu duelo, tu rival te
  espera en la sala, te piden amistad o tienes un amigo nuevo, han reaccionado a tu reto y, por la tarde, el recordatorio de racha (a quien jugó
  ayer y aún no hoy). Cada dispositivo elige cuáles quiere desde el 🔔 de la portada.
- Sin librerías: el contenido va cifrado para el navegador (RFC 8291) y firmado con la clave VAPID del
  servidor (RFC 8292), con WebCrypto (`backend/src/webpush.ts`). Solo se envía a los servicios push de
  los navegadores (Google, Mozilla, Apple, Microsoft) y las suscripciones caducadas se borran solas.
- Para no agobiar: los avisos de un duelo, como mucho uno cada 10 minutos; las reacciones, uno por
  amigo y día; los de amistad, uno por persona y hora; el recordatorio, uno al día (`push_log`).
- El recordatorio lo lanza una tarea programada (`triggers.crons` en `wrangler.jsonc`, 18:00 UTC).
- La app se puede instalar (`public/manifest.webmanifest`); en iPhone hace falta instalarla para
  recibir notificaciones. El service worker que las muestra es `public/sw.js`.
- Sin conexión: el service worker guarda el juego. Al compilar, `vite.config.ts` escribe en `dist/sw.js` la
  versión y la lista de archivos; así cada despliegue instala la versión nueva y borra la anterior. Las
  páginas van primero a la red (con conexión, siempre lo último) y los archivos, desde lo guardado; la API
  nunca se guarda.

## Seguridad

- Sesiones: token aleatorio de 256 bits en una cookie `HttpOnly`, `Secure` y `SameSite=Strict` (con el
  prefijo `__Host-`): el código de la página no puede leerla, así que un script inyectado no puede robar
  la sesión, y no viaja en peticiones desde otras webs. En la base de datos solo se guarda su hash. Los
  juegos de antes, que guardaban el token en `localStorage`, lo mandan una vez y pasan a la cookie.
  Google se verifica con su firma, emisor, destinatario y caducidad (`backend/src/google.ts`).
- Lo que cambia algo (todo salvo las lecturas) solo se acepta si viene del propio juego (cabecera
  `Origin`), además de `SameSite`.
- Cuentas nuevas: como mucho 3 por minuto y 20 al día desde la misma IP y, si Turnstile está activado,
  solo tras comprobar que es una persona (`backend/src/turnstile.ts`): un script no puede crearlas en masa.
- Ligas: como mucho 50 miembros. Quien crea una liga puede expulsar a alguien (no puede volver con el
  código) y cambiar el código, por si se comparte donde no debía.
- Todas las consultas SQL van con parámetros. Lo de otros jugadores (nombres, niveles, ligas) se pinta
  siempre como texto, nunca como HTML.
- Permisos: perfiles, partidas (fantasma) y rankings de liga solo entre quienes comparten liga. Unirse
  con un enlace pide confirmación y se puede salir de una liga.
- Lecturas agrupadas: las que el juego hace a la vez (las de la portada al abrirla) van juntas en una
  sola petición, `GET /api/batch?p=…` (hasta 12), con la sesión comprobada una vez y cada lectura por su
  ruta de siempre (`frontend/src/shared/api.ts`, `backend/src/index.ts`).
- Límites: 120 peticiones por minuto y jugador a toda la API, cuerpos de 32 KB como mucho, y límites
  propios para crear cuentas, unirse a ligas y publicar niveles (`wrangler.jsonc`).
- Cabeceras: CSP estricta y el resto de cabeceras de seguridad en `frontend/public/_headers`; la API
  pone las suyas en `backend/src/http.ts`.
- Las IP solo se guardan como hash con el día dentro, para contar cuentas nuevas, y se borran a diario.
- Las sesiones caducan tras un año sin usarse. Con la cuenta de Google se puede cerrar sesión en todos
  los dispositivos, y cualquiera puede borrar su cuenta con todos sus datos (sus ligas pasan a otro miembro).
- Nombres: solo alfabeto latino (con tildes y ñ), números y . _ ' -; y no puede haber dos con la misma
  clave (sin tildes, mayúsculas ni separadores), para que nadie se haga pasar por otro
  (`common/logic/players/names.ts`). Los nombres de jugador, nivel y liga pasan además un filtro de
  insultos y palabrotas en los siete idiomas que ve a través de los trucos habituales (`pu7a`, `f.u.c.k`,
  letras repetidas), sin bloquear palabras inocentes como «computadora» (`common/logic/players/offensive.ts`).
- Trampas: el servidor reproduce cada partida y rechaza las imposibles o enviadas sin jugar, pero no
  puede saber si alguien ha calculado la solución por su cuenta (el juego entero corre en el navegador).
- El email de las cuentas de Google se guarda cifrado (AES-GCM con el secreto `EMAIL_KEY`,
  `backend/src/seal.ts`); sin la clave no se guarda.
- HTTPS forzado: el Worker redirige a HTTPS las páginas y la API (workers.dev no tiene ese ajuste).
- Privacidad (RGPD/LSSI): sin cookies. Las tipografías se sirven desde aquí (no desde Google Fonts) y
  el script de Google solo se carga al pulsar «Continuar con Google». Las analíticas, si se activan,
  son de Cloudflare Web Analytics, sin cookies. Textos legales en `frontend/public/legal/`.
- Avisos de errores: los errores de JS de los jugadores (sin datos de su cuenta) llegan a
  `POST /api/errors` y quedan en los logs del Worker: Cloudflare → Workers → skid → Logs, filtrando
  por `event = clientError` (`frontend/src/shared/errors.ts`, `backend/src/routes/errors.ts`). Como
  mucho 5 por carga de la página y 10 por minuto desde la misma IP.

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

Comprobación de cada PR (`.github/workflows/ci.yml`): tipos, tests y compilación, con ✅ o ❌ en el PR
antes de fusionarlo.

Despliegue automático en cada push a `main` (`.github/workflows/deploy.yml`, pasa los tests antes):
añade en GitHub, en *Settings → Secrets and variables → Actions*, los secrets
`CLOUDFLARE_API_TOKEN` (créalo en el panel con la plantilla *Edit Cloudflare Workers* y permiso
*D1: Edit*) y `CLOUDFLARE_ACCOUNT_ID`.

Notificaciones: la clave pública VAPID está en `wrangler.jsonc` y la privada es un secreto del Worker
(una sola vez: `pnpm exec wrangler secret put VAPID_PRIVATE_KEY`). Sin ella el juego funciona igual,
pero sin notificaciones. En local se lee de `.dev.vars` (no se sube al repositorio). Para generar un
par nuevo hay que cambiar las dos a la vez (las suscripciones existentes dejan de valer).

Email cifrado: el secreto `EMAIL_KEY` (32 bytes aleatorios en base64url; ver `.dev.vars.example`).
Sin él, el login con Google funciona pero no se guarda el email. No se puede cambiar sin perder los
emails ya cifrados.

Analíticas: crea el sitio en el panel de Cloudflare (*Web Analytics*, configuración manual con
JavaScript) y pon su token en `CF_ANALYTICS_TOKEN` (`wrangler.jsonc`). Vacío, no se cargan.

Turnstile (comprobar que es una persona al crear una cuenta): en el panel de Cloudflare, *Turnstile →
Add widget*, con el dominio del juego (`skid.<tu-subdominio>.workers.dev`) y el modo *Managed*. Pon su
clave pública (*Site Key*) en `TURNSTILE_SITE_KEY` (`wrangler.jsonc`) y la secreta como secreto del
Worker: `pnpm exec wrangler secret put TURNSTILE_SECRET`. Sin las dos no se comprueba nada (en local
tampoco; para probarlo hay claves de prueba en `.dev.vars.example`).

Panel de administración: el secreto `ADMIN_GOOGLE_SUBS` lleva los identificadores («sub») de las
cuentas de Google con acceso, separados por comas. Para ver el tuyo, entra en Skid con Google y busca
tu jugador: `pnpm exec wrangler d1 execute skid --remote --command "SELECT name, google_sub FROM players
WHERE google_sub IS NOT NULL"`. Con el secreto puesto, sale la casilla «Admin» en la portada (resumen,
niveles denunciados, cualquier nivel y nombres de jugadores). Cada acción queda en los logs del Worker
(`event = adminAction`).

## Copias de seguridad

Hay dos redes de seguridad para la base de datos:

- **Time Travel de D1** (incluido en Cloudflare): vuelve la base entera a cualquier minuto de los
  últimos 7 días en el plan gratuito (30 en el de pago). Es lo primero que hay que probar si algo
  borra o estropea datos: `pnpm exec wrangler d1 time-travel restore skid --timestamp=2026-10-16T10:00:00Z`
  (la hora en UTC, de antes del problema; `time-travel info` enseña qué punto usaría).
- **Copia semanal** (`.github/workflows/backup.yml`): cada lunes a las 03:30 UTC exporta la base de
  producción, la cifra con AES-256 y la guarda como artefacto del run durante 90 días (unas 13 copias).
  También se puede lanzar a mano desde *Actions → Copia de seguridad → Run workflow*. Necesita el
  secret `BACKUP_PASSPHRASE` (una contraseña larga): **guárdala también fuera de GitHub**, en tu gestor
  de contraseñas. Sin ella las copias no se pueden abrir.

Restaurar una copia semanal (sin tocar la base actual hasta el final):

1. En *Actions → Copia de seguridad*, abre el run del día que quieras y descarga el artefacto
   `skid-AAAA-MM-DD` (un zip con `skid-AAAA-MM-DD.sql.gpg`).
2. Descífrala (pide la contraseña): `gpg --output skid.sql --decrypt skid-AAAA-MM-DD.sql.gpg`.
3. Para mirarla antes en local, en una base aparte:
   `pnpm exec wrangler d1 execute skid --local --persist-to .restaurar --file skid.sql`.
4. Crea una base nueva y cárgala: `pnpm exec wrangler d1 create skid-restaurada` y
   `pnpm exec wrangler d1 execute skid-restaurada --remote --file skid.sql`.
5. En `wrangler.jsonc`, cambia el `database_id` por el de la base nueva (deja `database_name` igual) y
   sube el cambio: el despliegue apunta el juego a ella. La base vieja queda intacta por si hiciera falta.

El archivo `skid.sql` descifrado tiene datos de los jugadores: bórralo al terminar.

## Avisos si se cae

`GET /api/health` (sin sesión) responde 200 si el Worker y la base de datos contestan, y 503 si la base
de datos falla (`backend/src/routes/health.ts`). Repite la última respuesta durante 30 segundos, así que
llamarla a menudo no gasta base de datos.

Para recibir un correo cuando el juego se cae (y otro cuando vuelve), un servicio externo gratuito como
[UptimeRobot](https://uptimerobot.com) la consulta cada 5 minutos:

1. *New monitor → HTTP(s)*, URL `https://skid.<tu-subdominio>.workers.dev/api/health`, cada 5 minutos.
2. Otro igual con la portada (`https://skid.<tu-subdominio>.workers.dev/`), para saber si los archivos del
   juego cargan.
3. En *Alert contacts*, tu correo (o la app del móvil, con avisos al momento).
