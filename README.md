# Redis Demo

An interactive app to learn the four most common Redis patterns hands-on: **caching**, **counters**, **rate limiting**, and **leaderboards**. Every page shows the exact Redis commands being executed and explains why they work.

For plain-English explanations, see [MANUAL.md](./MANUAL.md).

---

## Quick Start (Local — Docker)

```bash
git clone <your-repo>
cd redis-demo
docker compose up
```

Open **http://localhost:3000**

This starts both the app and a local Redis instance (standalone, no cluster). Redis data is in-memory only — it resets when the container stops.

---

## Deploy to Porter

The app is a single container. Redis is **not bundled** — connect it to Porter's managed Redis service via environment variables.

### Steps

1. **Create a Redis service in Porter** — use standalone mode (not cluster).
2. **Add the app service** — point it at this repo or your Docker image.
3. **Set environment variables** on the app service:

| Variable | Required | Description | Example |
|---|---|---|---|
| `REDIS_HOST` | Yes | Redis hostname from Porter | `redis-abc123.internal` |
| `REDIS_PORT` | Yes | Redis port | `6379` |
| `REDIS_PASS` | If set | Redis auth password | `s3cr3t` |
| `PORT` | No | App port (Porter sets this automatically) | `3000` |

> **Important:** This app connects in standalone (non-cluster) mode. Do not point it at a Redis Cluster or Sentinel endpoint — use a single Redis instance.

### Why no Redis in the production Docker Compose?

`docker-compose.yml` is for local development only. On Porter, Redis is a separate managed service. The app reads `REDIS_HOST` / `REDIS_PORT` at startup, so switching between local and production is just a matter of environment variables.

---

## Local environment variables

```bash
cp .env.example .env
# Edit .env with your local overrides
```

`.env` is blocked by the pre-commit hook — it will never be accidentally committed.

---

## Security

A pre-commit hook runs automatically after `npm install` (via the `prepare` script). It checks:

- No `.env` files are staged (only `.env.example` is allowed)
- No hardcoded secrets, API keys, AWS credentials, or private keys in staged files
- No `HIGH` or `CRITICAL` npm vulnerabilities (`npm audit`)

**Run the security check manually:**

```bash
npm run security
```

**What's protected in the app itself:**

| Protection | How |
|---|---|
| XSS | All user-controlled values escaped with `esc()` before HTML rendering |
| Content Security Policy | `default-src 'none'` blocks inline scripts and external resources |
| X-Forwarded-For spoofing | IP validated with `net.isIP()` before use as a Redis key |
| Input bounds | Player names: alphanumeric, max 30 chars. Scores: 0–999,999. Stock delta: ±1,000 |
| Non-root container | Docker runs as `appuser`, not root |

---

## Routes

| Route | Pattern | What it demonstrates |
|---|---|---|
| `GET /` | — | Overview of all patterns with Redis command previews |
| `GET /cache` | Caching | First load: 2s (simulated DB). Subsequent: &lt;1ms (Redis hit) |
| `GET /cache/clear` | — | Delete the cached key to trigger a fresh miss |
| `GET /counter` | Atomic increment | Page view counter + interactive stock adjustment |
| `POST /counter/stock` | Atomic increment | INCRBY / DECRBY with bounds checking |
| `GET /rate-limit` | Rate limiting | 5 requests per 30s per IP — click until blocked |
| `GET /leaderboard` | Sorted Set | Auto-ranked leaderboard with seed data |
| `POST /leaderboard/score` | Sorted Set | Add or update a player's score |
| `GET /keys` | Inspection | All live Redis keys with type and TTL |

---

## Project structure

```
redis-demo/
├── index.js              # App — all routes and Redis logic
├── Dockerfile            # Production image (app only, no Redis)
├── docker-compose.yml    # Local dev (app + standalone Redis)
├── .env.example          # Environment variable template
├── .gitignore
├── .dockerignore
├── scripts/
│   └── security-check.sh # Pre-commit security gate
├── MANUAL.md             # Plain-English Redis guide
└── README.md
```

---

## npm scripts

```bash
npm start        # Run the app
npm run dev      # Run with --watch (auto-restart on file changes)
npm run security # Run the security check manually
```
