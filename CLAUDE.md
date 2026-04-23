# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # run the app (requires Redis)
npm run dev        # run with --watch (auto-restart on file save)
npm run security   # run the pre-commit security check manually
docker compose up  # start app + local Redis together (recommended for dev)
docker compose up --build  # rebuild the Docker image after code changes
```

There are no tests and no linter configured.

## Architecture

The entire app is a single file: `index.js`. It is a server-rendered Express app — no client-side JS, no build step, no templating engine. All HTML is generated via template literals.

**File layout inside `index.js`:**
1. Express + security headers middleware
2. ioredis client (standalone mode, never cluster)
3. `esc()` — HTML escape helper used on every user-controlled value before rendering
4. `getClientIp()` — validates `X-Forwarded-For` with `net.isIP()` before use
5. `CSS` constant — the full design system as an inline string (CSS custom properties, component classes)
6. `page()` — shell function that wraps every response: injects CSS, renders sticky nav with active-state highlighting
7. Route handlers — one per Redis pattern, each self-contained

**Routes and what Redis pattern they teach:**

| Route | Redis commands | Pattern |
|---|---|---|
| `GET /cache` | `GET`, `SET … EX` | Cache miss (2s simulated delay) → cache hit (<1ms) |
| `GET /cache/clear` | `DEL` | Resets the cache demo |
| `GET /counter` | `INCR`, `INCRBY`, `SET` | Atomic page-view counter + stock level |
| `POST /counter/stock` | `INCRBY`, `SET` | Delta clamped to ±1000 |
| `GET /rate-limit` | `INCR`, `EXPIRE`, `TTL` | 5 req / 30s per IP, auto-reset |
| `GET /leaderboard` | `ZADD`, `ZREVRANGE`, `ZCARD`, `EXISTS` | Sorted Set rankings |
| `POST /leaderboard/score` | `ZADD` | Player names: `[a-z0-9_]`, max 30 chars; scores: 0–999,999 |
| `GET /keys` | `KEYS demo:*`, `TYPE`, `TTL`, `GET`, `ZCARD` | Live key inspector |

**Redis connection:** reads `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASS` from env. Defaults to `localhost:6379` with no auth. Production uses `REDIS_PASS` (not `REDIS_PASSWORD`).

## Security constraints

- All user-controlled strings (player names, IP addresses, Redis values) must go through `esc()` before being embedded in HTML.
- `getClientIp()` must be used instead of reading `x-forwarded-for` directly — it validates the IP with `net.isIP()`.
- Player name input is restricted to `/^[a-z0-9_]+$/` before being stored in Redis.
- The pre-commit hook (`scripts/security-check.sh`) runs automatically on every commit. It blocks `.env` files, scans for secret patterns, and runs `npm audit --audit-level=high`. It is reinstalled via the `prepare` npm script on `npm install`.

## Docker

`docker-compose.yml` is for local dev only — it starts both the app and a standalone Redis instance (no cluster, no persistence). The `Dockerfile` builds the app image alone (no Redis); production connects to an external managed Redis via env vars.

After editing `index.js`, run `docker compose up --build` — a plain restart won't pick up code changes because the image must be rebuilt.
