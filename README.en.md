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
- **Duels**: challenge a friend (or anyone, with a link) to the same brand-new board.
- **Leagues**: daily and weekly rankings with your friends, and monthly seasons whose champion
  wins that month's hat; emoji reactions to your friends' challenges; achievements unlock more
  hats.
- **Player levels**: level editor, publishing (you must beat your level first), ratings, per-level
  ranking, sharing and reporting.
- A "How to play" guide, dark mode, synthesized music and sound effects, and Google sign-in to play
  on several devices.
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
  src/
    main.ts                startup and routes
    style.css              styles (light and dark theme with CSS variables)
    features/              one folder per feature: screens, server calls (api.ts)
      home/                and what it stores in the browser (storage.ts)
      free-play/           free play
      daily/               daily challenge, stats, solution and a friend's ghost
      weekly/              weekly challenge
      duels/               duels: challenge, accept, play, result and rematch
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
    routes/                one file per feature: daily, weekly, duels, leagues, seasons,
                           reactions, levels, players, stats, achievements
  migrations/              D1 database schema (0001 to 0014)
common/                    used by both; no browser APIs and no imports from outside
  logic/                   pure rules: the server replays games with this very same code
    engine/                board, movement, solver, generator, elements, randomness
    daily/                 daily challenge, league points and streaks
    weekly/                weekly challenge
    duels/                 duels: difficulties and who wins
    achievements/          achievements
    leagues/               seasons (dates, podium and each month's hat) and reactions
    community/             validation of player-made levels
    players/               player name rules
  i18n/                    languages and the server's error messages in each one
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

## Duels

- Challenge a friend from your leagues, or anyone with a link (`?duelo=`), and pick the difficulty
  (free-play levels 6, 12 and 32). The server generates the board when the duel is created and
  stores it.
- Each player plays as many times as they like, with no hints, and hands in their best score. The
  duel ends when both have handed in or after 48 hours; until then you can't see the other player's
  score. Fewer moves wins and, on a tie, the faster player (from when they started until their best
  attempt).
- Afterwards: the ghost with both best attempts, and a rematch.
- Logic in `common/logic/duels/`, server in `backend/src/routes/duels.ts` and the game in
  `frontend/src/features/duels/`. The "best attempt" game is shared with the weekly challenge
  (`frontend/src/play/attempt-screen.ts`).

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
