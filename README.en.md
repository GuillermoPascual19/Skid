# Skid

[Español](README.md) · **English**

Ice-sliding puzzle: the penguin doesn't stop until it hits something, and you have to collect the
pieces in order in as few moves as possible. Daily and weekly challenges, duels and leagues with
friends, and levels made by the players.

**Play at <https://skid.gpm-854.workers.dev>** (the game is in Spanish).

## What's inside

- **Free play**: generated levels that get harder and harder, with stars based on your moves and
  elements that unlock along the way (snow, currents, teleporters and holes).
- **Daily challenge**: the same board for everyone; whoever does it in the fewest moves wins. With
  streaks, streak freezes, the solution once you finish, and a friend's ghost.
- **Weekly challenge**: a big, hard board from Monday to Sunday, with a ranking among friends.
- **Time attack**: 3 minutes to clear as many boards as you can, the same for everyone all week,
  with a ranking among friends.
- **Live duels**: challenge a friend (or anyone, with a link) and play the same brand-new board at
  the same time.
- **Leagues**: daily and weekly rankings with your friends, and monthly seasons whose champion
  wins that month's hat; emoji reactions to your friends' challenges; achievements unlock more
  hats.
- **Player levels**: level editor, publishing (you must beat your level first), ratings, per-level
  ranking, sharing and reporting.
- A "How to play" guide, dark mode, synthesized music and sound effects, and Google sign-in to play
  on several devices.
- It installs as an app and sends notifications (duels, reactions and streak reminder).
- In seven languages: Spanish, English, German, French, Portuguese, Italian and Russian. It picks
  the browser's language and can be changed from the home screen.
- Share on WhatsApp or Telegram, copy the link or the message, or use the system share menu.

## Tech stack

| Part | Technology |
|---|---|
| Game | [TypeScript](https://www.typescriptlang.org/) 7 with no UI framework (plain DOM), [Phaser](https://phaser.io/) 4 for the board, [Vite](https://vite.dev/) 8 |
| Sound | Web Audio API: music and effects synthesized in the browser, no audio files |
| Server | [Cloudflare Workers](https://developers.cloudflare.com/workers/): serves the game (static assets) and the `/api/*` API |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) with SQL migrations; Workers Rate Limiting against abuse |
| Accounts | Anonymous players with a token; optional [Sign in with Google](https://developers.google.com/identity/gsi/web) |
| Tests | [Vitest](https://vitest.dev/) 4 |
| Tooling | Node 24, [pnpm](https://pnpm.io/) 10, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 4 |
| Deployment | GitHub Actions: tests, build, migrations and deploy on every merge to `main` |

The game logic (`common/`) is plain TypeScript used on both sides: by the browser to play, and by the
server to replay every game and check that it's valid.

## Development

You need **Node 24** (see `.node-version`) and **pnpm** (its version is in `packageManager` in
`package.json`; `corepack enable` installs it for you). For security, `pnpm-workspace.yaml` only lets
`esbuild`, `sharp` and `workerd` run install scripts, and doesn't install versions published less
than 3 days ago.

```sh
pnpm install
pnpm run dev     # game (Vite, http://localhost:5173) + API with a local D1 (Wrangler, :8787)
pnpm test        # tests (Vitest)
pnpm run build   # type-checks and builds to dist/
```

`pnpm run dev:web` starts only the game; the ranking will show a connection error until the API is
running. With an empty `VITE_API_BASE=` in `.env.local` the game works without the online ranking
(by default the API is at `/api` on the same domain).

## Project structure

Three parts: the game (`frontend/`), the server (`backend/`) and what both use (`common/`). Inside,
it's organized by feature: to change something, go to its folder.

```
frontend/                  the game in the browser (Vite)
  index.html
  public/                  copied as-is to dist/
    _headers               security headers (CSP…) for the site
    theme-init.js          applies the theme before the first paint
    sw.js                  service worker: shows the notifications
    manifest.webmanifest   installable app (with its icons)
  src/
    main.ts                startup and routes
    style.css              styles (light and dark theme with CSS variables)
    features/              one folder per feature: screens, server calls (api.ts)
      home/                and what it stores in the browser (storage.ts)
      free-play/           free play
      daily/               daily challenge, stats, solution and a friend's ghost
      weekly/              weekly challenge
      timeattack/          time attack: game, card and ranking
      duels/               duels: challenge, waiting room, live game, result and rematch
      ranking/             leagues, seasons, reactions and move-based rankings (levels,
                           weekly challenge)
      achievements/        achievements and hats
      community/           player levels: list, editor, play, rate, report
      profile/             name, Google sign-in, other players' profiles and account
      guide/               "How to play" guide and what's-new notice
    play/                  the game screen shared by every mode (pause, gestures, keys) and the
                           "best attempt" game (weekly challenge and duels)
    i18n/                  t() for texts and one dictionary per language (locales/)
    game/                  the Phaser board: scene, tile drawing, effects, palette
    audio/                 synthesized music and effects, and their controls
    shared/                shared pieces: dom, router, celebrations, connection, storage and theme
backend/                   the Cloudflare Worker: serves the game (dist/) and the /api/* API
  src/
    index.ts               routing only
    http.ts                errors, responses and input validation
    session.ts             sessions, Google sign-in, signing out and deleting the account
    google.ts              Google token verification
    i18n.ts                each request's language for error messages
    push.ts                notifications: who, in which language and without repeats
    webpush.ts             notification encryption and VAPID signing (no libraries)
    routes/                one file per feature: daily, weekly, timeattack, duels, leagues,
                           seasons, reactions, levels, players, stats, achievements
  migrations/              D1 database schema (0001 to 0017)
common/                    used by both; no browser APIs and no imports from outside
  logic/                   pure rules: the server replays games with this very same code
    engine/                board, movement, solver, generator, elements, randomness
    daily/                 daily challenge, league points and streaks
    weekly/                weekly challenge
    timeattack/            time attack: the week's boards and points
    duels/                 duels: difficulties, timings and who wins
    achievements/          achievements
    leagues/               seasons (dates, podium and each month's hat) and reactions
    community/             validation of player-made levels
    players/               player name rules
  i18n/                    languages, error messages and notification texts
  art/                     SVG drawings (penguin, hats, elements)
tests/                     backend/ and common/, mirroring the code tree
.github/workflows/         automatic deployment
wrangler.jsonc             Worker config: D1, rate limits, assets
vite.config.ts             Vite and Vitest
pnpm-workspace.yaml        pnpm security settings
```

`pnpm run build` type-checks the three parts (`common/` without the DOM and without importing
anything from outside) and builds the game to `dist/`.

## Daily challenge and scoring

- The same board for everyone; it changes at midnight, Madrid time.
- Your result is the number of moves in your best attempt, and every hint counts as one more: the
  fewer, the better. Restarting is free; you can keep improving all day (unless you've looked at the
  solution). With the same number of moves, the faster player wins: the clock starts when you press
  *Start* and never stops.
- Behind the scenes, for the weekly standings and the seasons, each challenge gives points: 1000 in
  the optimum and 100 less per extra move (minimum 100). The constants live in
  `common/logic/daily/score.ts`. The daily ranking sorts by moves (`over_par`), not by points;
  challenges played before move-based scoring keep their points.
- When you finish you can watch the optimal solution, played by the penguin.
- The server doesn't trust the client: the browser sends the move log and the Worker replays it to
  work out the best attempt, the time (with its own clock) and the points.
- Players are anonymous: the first time, the server hands out a token that's stored in the browser
  (the database only keeps its hash). Everyone picks their own name.

## Weekly challenge

- A bigger, harder board (free-play level 30, with snow and currents) from Monday to Sunday, the same
  for everyone. The server generates it the first time someone asks for it and stores it in
  `weekly_boards`; the game downloads it from there.
- Play as many times as you like, with no hints; your best attempt counts. The ranking is with your
  friends (anyone who shares a league with you); ties go to whoever got there first.
- Logic in `common/logic/weekly/`, server in `backend/src/routes/weekly.ts` and the game in
  `frontend/src/features/weekly/`.

## Time attack

- 3 minutes to clear as many small boards as you can, one after another and each a little harder
  (it starts at free-play level 4 and goes up one level per board).
- Each board gives 100 points plus 20 for every board already cleared (skipped ones don't count),
  and a 50-point bonus in the optimum. You can skip one at the cost of 10 s. You can restart a board, but the clock keeps
  running.
- The week's boards are the same for everyone. Each one is generated the first time someone reaches
  it and stored in `time_attack_boards` (generating many at once doesn't fit in one request).
- The server sets the start time (after a 3 s countdown) and the end, and replays every board as it
  arrives: it checks the board was cleared, that it wasn't played faster than the animations allow
  and that time wasn't up (with 3 s of slack for the network). Weekly ranking with the friends from
  all your leagues: each player's best game counts.
- Logic in `common/logic/timeattack/`, server in `backend/src/routes/timeattack.ts` and the game in
  `frontend/src/features/timeattack/`.

## Duels

- Challenge a friend from your leagues, or anyone with a link (`?duelo=`), and pick the difficulty
  (free-play levels 6, 12 and 32). The server generates the board when the duel is created and
  stores it.
- Duels are live. Both players wait in the duel room; while it's open, the game pings the server
  every 2 s (`POST /duels/:id/here`). When both are there and both press *Start*
  (`PUT /duels/:id/ready`), the server sets the start time, the same for both, after a 5 s countdown.
  They have 48 hours to meet.
- One attempt, no hints: you can restart, but the clock keeps running. When you finish, your result
  is sent and you wait for your rival; their result stays hidden until both have finished (or 20
  minutes have passed). Fewer moves wins and, on a tie, the faster player.
- The room stays in the URL (`?duelo=`): if the phone reloads the page when you come back from
  WhatsApp, you land back in it.
- Afterwards: the ghost with both attempts, and a rematch.
- Logic in `common/logic/duels/`, server in `backend/src/routes/duels.ts` and the game in
  `frontend/src/features/duels/` (the room in `duel-room.ts`, the game in `duel-play.ts`).

## Seasons

- Every calendar month is a season in each league. Whoever scores the most points wins (the same
  points as the ranking) and, on a tie, whoever won more days; at least 2 must have played. A tie
  at the top means two champions.
- The champion wins that month's hat (12, one per month: `SEASON_HATS`), which can't be earned
  any other way. The first season that counts is September 2026.
- There are no scheduled jobs: a season is closed the first time someone in the league opens the
  game after it ends. The podium is stored in `season_results` along with the league name, so the
  title and the hat stay even if someone leaves later or the league is deleted.
- Logic in `common/logic/leagues/seasons.ts`, server in `backend/src/routes/seasons.ts` and the
  game in the Season tab of the ranking (`frontend/src/features/ranking/season.ts`).

## Notifications

- Push notifications even when the game is closed: someone challenges you to a duel, someone accepted
  your duel, your rival is waiting in the room, someone reacted to your challenge and, in the
  evening, the streak reminder (for players who played yesterday but not yet today). Each device picks
  which ones it wants from the 🔔 on the home screen.
- No libraries: the content is encrypted for the browser (RFC 8291) and signed with the server's
  VAPID key (RFC 8292), using WebCrypto (`backend/src/webpush.ts`). It only sends to the browsers' push
  services (Google, Mozilla, Apple, Microsoft), and expired subscriptions are deleted automatically.
- To avoid spamming: duel notifications at most once every 10 minutes; reactions, one per friend per
  day; the reminder, once a day (`push_log`).
- The reminder is sent by a scheduled job (`triggers.crons` in `wrangler.jsonc`, 18:00 UTC).
- The app can be installed (`public/manifest.webmanifest`); on iPhone it has to be installed to get
  notifications. The service worker that shows them is `public/sw.js`.

## Security

- Sessions: a random 256-bit token in the browser; the database only keeps its hash. Google tokens are
  checked for signature, issuer, audience and expiry (`backend/src/google.ts`).
- Every SQL query is parameterized. Anything from other players (names, levels, leagues) is always
  rendered as text, never as HTML.
- Permissions: profiles, games (ghosts) and league rankings are only visible among players who share a
  league. Joining through a link asks for confirmation, and you can leave a league.
- Limits: 120 requests per minute per player across the whole API, request bodies of 32 KB at most,
  and specific limits for creating accounts, joining leagues and publishing levels (`wrangler.jsonc`).
- Headers: a strict CSP and the other security headers in `frontend/public/_headers`; the API sets its
  own in `backend/src/http.ts`.
- IP addresses are only stored as a hash that includes the date, to count new accounts, and are
  deleted daily.
- Sessions expire after a year without use. With a Google account you can sign out on every device,
  and anyone can delete their account with all its data (their leagues pass to another member).
- Names: Latin alphabet only (with accents and ñ), digits and . _ ' -; and no two names can share the
  same key (ignoring accents, case and separators), so nobody can impersonate someone else
  (`common/logic/players/names.ts`).
- Cheating: the server replays every game and rejects impossible ones or ones sent without playing,
  but it can't know whether someone worked out the solution on their own (the whole game runs in the
  browser).
- The email of Google accounts is stored encrypted (AES-GCM with the `EMAIL_KEY` secret,
  `backend/src/seal.ts`); without the key it isn't stored.
- HTTPS enforced: the Worker redirects pages and the API to HTTPS (workers.dev has no such setting).
- Privacy (GDPR/LSSI): no cookies. Fonts are served from here (not from Google Fonts) and Google's
  script only loads when the player taps "Continue with Google". Analytics, if enabled, are Cloudflare
  Web Analytics, cookieless. Legal pages in `frontend/public/legal/` (Spanish).

## Languages

Spanish (`frontend/src/i18n/locales/es.ts`) is the reference: the other dictionaries must have the
same keys, and `pnpm run build` fails if one is missing. Plurals have `one` and `other`, and Russian
also `few` and `many`. Shared logic carries no text: it returns codes (`BoardError`, `nameProblem`…)
and each side translates them. The server answers errors in the language of the `X-Skid-Lang` header
(or `Accept-Language`). Baloo 2 has no Cyrillic, so Russian is shown in Nunito (the browser only
downloads it when there's Cyrillic text).

## Deploying to Cloudflare

Everything lives in one Worker: the game (static files) and the API, with a D1 database. The free plan
is more than enough.

First time:

1. Create an account at [cloudflare.com](https://dash.cloudflare.com/sign-up) and sign in from the
   terminal: `pnpm exec wrangler login`.
2. Create the database: `pnpm exec wrangler d1 create skid`, and copy the `database_id` it returns
   into `wrangler.jsonc`.
3. Publish: `pnpm run deploy`. It applies the migrations and deploys; when it finishes it shows the
   URL (`https://skid.<your-subdomain>.workers.dev`).

Automatic deployment on every push to `main` (`.github/workflows/deploy.yml`, runs the tests first):
in GitHub, under *Settings → Secrets and variables → Actions*, add the secrets `CLOUDFLARE_API_TOKEN`
(create it in the dashboard with the *Edit Cloudflare Workers* template and the *D1: Edit*
permission) and `CLOUDFLARE_ACCOUNT_ID`.

Notifications: the public VAPID key is in `wrangler.jsonc` and the private one is a Worker secret
(once: `pnpm exec wrangler secret put VAPID_PRIVATE_KEY`). Without it the game works the same, just
without notifications. Locally it's read from `.dev.vars` (not committed). To generate a new pair,
change both at once (existing subscriptions stop working).

Encrypted email: the `EMAIL_KEY` secret (32 random bytes in base64url; see `.dev.vars.example`).
Without it, Google sign-in works but the email isn't stored. It can't be changed without losing the
emails already encrypted.

Analytics: create the site in the Cloudflare dashboard (*Web Analytics*, manual JavaScript setup) and
put its token in `CF_ANALYTICS_TOKEN` (`wrangler.jsonc`). If it's empty, nothing is loaded.
