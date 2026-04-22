const express = require('express');
const Redis = require('ioredis');
const net = require('net');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Content Security Policy — blocks XSS even if escaping is missed anywhere
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Connect to Redis (standalone mode — do NOT use Redis.Cluster)
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  // Explicit standalone settings — never cluster
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

// ─────────────────────────────────────────────
// SECURITY HELPERS
// ─────────────────────────────────────────────

// Escapes user-controlled strings before embedding in HTML
const esc = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Extracts the first valid IP from X-Forwarded-For, falls back to socket IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (net.isIP(first)) return first;
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// ─────────────────────────────────────────────
// HTML helper
// ─────────────────────────────────────────────
const page = (title, body) => `<!DOCTYPE html>
<html>
<head>
  <title>${esc(title)} · Redis Demo</title>
  <style>
    body { font-family: monospace; max-width: 760px; margin: 40px auto; padding: 0 20px; background: #0d1117; color: #c9d1d9; }
    h1 { color: #58a6ff; } h2 { color: #79c0ff; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    a { color: #58a6ff; } nav a { margin-right: 16px; }
    pre { background: #161b22; padding: 16px; border-radius: 6px; overflow-x: auto; border: 1px solid #30363d; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .hit  { background: #1f6feb; color: #fff; }
    .miss { background: #b08800; color: #fff; }
    .warn { background: #da3633; color: #fff; }
    form { margin: 12px 0; } input, button { padding: 8px 12px; border-radius: 4px; border: 1px solid #30363d; }
    input { background: #161b22; color: #c9d1d9; } button { background: #1f6feb; color: #fff; cursor: pointer; border: none; }
    table { border-collapse: collapse; width: 100%; } td, th { padding: 8px 12px; border: 1px solid #30363d; text-align: left; }
    th { background: #161b22; }
    .box { background: #161b22; border: 1px solid #30363d; padding: 16px; border-radius: 6px; margin: 12px 0; }
    .dim { color: #8b949e; font-size: 13px; }
  </style>
</head>
<body>
  <nav style="margin-bottom:24px; padding-bottom:12px; border-bottom:1px solid #30363d">
    <a href="/">🏠 Home</a>
    <a href="/cache">📦 Cache</a>
    <a href="/counter">🔢 Counter</a>
    <a href="/rate-limit">🚦 Rate Limit</a>
    <a href="/leaderboard">🏆 Leaderboard</a>
    <a href="/keys">🔑 All Keys</a>
  </nav>
  <h1>${esc(title)}</h1>
  ${body}
</body>
</html>`;

// ─────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(page('Redis Demo', `
    <p>This app demonstrates the four most common Redis patterns. Each page shows you <strong>what Redis command is being used</strong> and why.</p>

    <h2>📦 <a href="/cache">Caching</a></h2>
    <p>Simulate an expensive database query (2s delay). The first call hits the DB; subsequent calls are served from Redis in &lt;1ms.</p>
    <pre>SET key value EX 30   ← store with 30s expiry
GET key               ← retrieve (or nil if expired)</pre>

    <h2>🔢 <a href="/counter">Counter / Atomic Increments</a></h2>
    <p>Track page visits, likes, or inventory counts atomically — no race conditions, no locks.</p>
    <pre>INCR visits           ← atomically increment by 1
INCRBY stock -5       ← decrement by 5</pre>

    <h2>🚦 <a href="/rate-limit">Rate Limiting</a></h2>
    <p>Allow a user N requests per minute. Redis TTL automatically resets the window.</p>
    <pre>INCR user:ip:requests
EXPIRE key 60         ← auto-reset after 60 seconds</pre>

    <h2>🏆 <a href="/leaderboard">Leaderboard</a></h2>
    <p>Sorted Sets store members with a score. Redis keeps them sorted automatically — perfect for rankings.</p>
    <pre>ZADD leaderboard 1500 "alice"   ← add/update score
ZREVRANGE leaderboard 0 9       ← top 10 (highest first)
ZSCORE leaderboard "alice"      ← get one player's score</pre>

    <h2>🔑 <a href="/keys">Inspect All Redis Keys</a></h2>
    <p>See every key currently stored in Redis with its type and TTL.</p>
  `));
});

// ─────────────────────────────────────────────
// PATTERN 1 — CACHING
// Simulates a slow DB call. First request takes 2s.
// All subsequent requests within 30s are instant (cache hit).
// ─────────────────────────────────────────────
app.get('/cache', async (req, res) => {
  const CACHE_KEY = 'demo:expensive_query';
  const CACHE_TTL = 30; // seconds

  const start = Date.now();
  const cached = await redis.get(CACHE_KEY);

  if (cached) {
    const elapsed = Date.now() - start;
    const ttl = await redis.ttl(CACHE_KEY);
    return res.send(page('📦 Caching', `
      <span class="badge hit">CACHE HIT</span>
      <p>Retrieved from Redis in <strong>${elapsed}ms</strong>. No database was touched.</p>
      <div class="box">
        <strong>Data:</strong> <code>${esc(cached)}</code><br>
        <span class="dim">This key expires in ${ttl} seconds.</span>
      </div>
      <h2>Redis Commands Used</h2>
      <pre>GET ${esc(CACHE_KEY)}
→ "${esc(cached)}"</pre>
      <p class="dim">To see a cache miss, wait ${ttl}s or <a href="/cache/clear">clear the cache</a>.</p>
    `));
  }

  // Cache miss — simulate slow database query
  await new Promise(r => setTimeout(r, 2000));
  const freshData = `user_count=4821, revenue=98234.50, fetched_at=${new Date().toISOString()}`;

  await redis.set(CACHE_KEY, freshData, 'EX', CACHE_TTL);

  const elapsed = Date.now() - start;
  res.send(page('📦 Caching', `
    <span class="badge miss">CACHE MISS</span>
    <p>Fetched from the (simulated) database in <strong>${elapsed}ms</strong>. Result is now cached.</p>
    <div class="box">
      <strong>Data:</strong> <code>${esc(freshData)}</code><br>
      <span class="dim">Stored in Redis for ${CACHE_TTL} seconds.</span>
    </div>
    <h2>Redis Commands Used</h2>
    <pre>GET ${esc(CACHE_KEY)}
→ (nil)   ← cache miss

SET ${esc(CACHE_KEY)} "..." EX ${CACHE_TTL}
→ OK</pre>
    <p><a href="/cache">Refresh this page</a> — the next request will be a cache hit (&lt;1ms).</p>
  `));
});

app.get('/cache/clear', async (req, res) => {
  await redis.del('demo:expensive_query');
  res.redirect('/cache');
});

// ─────────────────────────────────────────────
// PATTERN 2 — ATOMIC COUNTER
// INCR is atomic — safe under high concurrency.
// ─────────────────────────────────────────────
app.get('/counter', async (req, res) => {
  const visits = await redis.incr('demo:counter:visits');

  let stock = await redis.get('demo:counter:stock');
  if (stock === null) {
    await redis.set('demo:counter:stock', 100);
    stock = 100;
  }

  res.send(page('🔢 Counter', `
    <p>Every time you load this page, Redis atomically increments a counter — no race conditions, no locks needed.</p>

    <h2>Page Visits</h2>
    <div class="box">
      <span style="font-size:48px; color:#58a6ff">${visits}</span>
      <p class="dim">This counter lives in Redis. It resets when Redis restarts (unless persistence is enabled).</p>
    </div>
    <h2>Redis Commands Used</h2>
    <pre>INCR demo:counter:visits
→ ${visits}</pre>

    <h2>Try: Adjust Stock Level</h2>
    <p>Stock: <strong>${parseInt(stock, 10)}</strong></p>
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <form method="POST" action="/counter/stock">
        <input type="hidden" name="delta" value="-10">
        <button>Sell 10 units (DECRBY 10)</button>
      </form>
      <form method="POST" action="/counter/stock">
        <input type="hidden" name="delta" value="25">
        <button>Restock 25 units (INCRBY 25)</button>
      </form>
      <form method="POST" action="/counter/stock">
        <input type="hidden" name="reset" value="true">
        <button>Reset stock to 100</button>
      </form>
    </div>
    <pre style="margin-top:16px">INCRBY demo:counter:stock 25   ← add 25
DECRBY demo:counter:stock 10   ← subtract 10</pre>
  `));
});

app.post('/counter/stock', async (req, res) => {
  if (req.body.reset) {
    await redis.set('demo:counter:stock', 100);
  } else {
    const delta = parseInt(req.body.delta, 10);
    // Clamp delta to prevent runaway values
    if (isNaN(delta) || delta < -1000 || delta > 1000) return res.redirect('/counter');
    await redis.incrby('demo:counter:stock', delta);
  }
  res.redirect('/counter');
});

// ─────────────────────────────────────────────
// PATTERN 3 — RATE LIMITING
// Each IP gets 5 requests per 30 seconds.
// IP is validated with net.isIP() before use as a Redis key.
// ─────────────────────────────────────────────
app.get('/rate-limit', async (req, res) => {
  const ip = getClientIp(req);                        // validated IP only
  const key = `demo:ratelimit:${ip}`;
  const LIMIT = 5;
  const WINDOW = 30; // seconds

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW);   // start window on first hit

  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, LIMIT - count);
  const blocked = count > LIMIT;

  res.send(page('🚦 Rate Limiting', `
    ${blocked
      ? `<span class="badge warn">BLOCKED</span> <p>You've exceeded the limit. Try again in <strong>${ttl}s</strong>.</p>`
      : `<span class="badge hit">ALLOWED</span>`
    }

    <h2>Your Request Window</h2>
    <table>
      <tr><th>Your IP</th><td><code>${esc(ip)}</code></td></tr>
      <tr><th>Requests this window</th><td>${count} / ${LIMIT}</td></tr>
      <tr><th>Remaining</th><td>${remaining}</td></tr>
      <tr><th>Window resets in</th><td>${ttl}s</td></tr>
    </table>

    <p><a href="/rate-limit">Make another request</a> — keep clicking to hit the limit!</p>

    <h2>Redis Commands Used</h2>
    <pre>INCR demo:ratelimit:&lt;your-ip&gt;
→ ${count}

${count === 1
  ? `EXPIRE demo:ratelimit:&lt;your-ip&gt; ${WINDOW}   ← start the ${WINDOW}s window\n→ 1`
  : `TTL demo:ratelimit:&lt;your-ip&gt;\n→ ${ttl}   ← seconds until reset`}</pre>

    <h2>Why This Works</h2>
    <p class="dim">
      <strong>INCR</strong> is atomic — even if 10,000 users hit this endpoint simultaneously,
      each one gets a unique, correct count. The <strong>EXPIRE</strong> TTL means Redis
      automatically cleans up old keys — no cron job needed.
    </p>
  `));
});

// ─────────────────────────────────────────────
// PATTERN 4 — LEADERBOARD (Sorted Sets)
// Player names are validated and HTML-escaped before rendering.
// ─────────────────────────────────────────────
const BOARD_KEY = 'demo:leaderboard';
const MAX_NAME_LEN = 30;
const MAX_SCORE = 999_999;

async function seedLeaderboard() {
  const exists = await redis.exists(BOARD_KEY);
  if (!exists) {
    await redis.zadd(BOARD_KEY,
      1200, 'alice',
      980,  'bob',
      1450, 'carol',
      670,  'dave',
      1100, 'eve',
    );
  }
}

app.get('/leaderboard', async (req, res) => {
  await seedLeaderboard();

  const raw = await redis.zrevrange(BOARD_KEY, 0, 9, 'WITHSCORES');

  const players = [];
  for (let i = 0; i < raw.length; i += 2) {
    players.push({ rank: players.length + 1, name: raw[i], score: parseInt(raw[i + 1]) });
  }

  const totalPlayers = await redis.zcard(BOARD_KEY);
  const medals = ['🥇', '🥈', '🥉'];

  // esc() applied to all values from Redis (including user-submitted names)
  const rows = players.map(p => `
    <tr>
      <td>${medals[p.rank - 1] || p.rank}</td>
      <td>${esc(p.name)}</td>
      <td>${p.score.toLocaleString()}</td>
    </tr>
  `).join('');

  res.send(page('🏆 Leaderboard', `
    <p>Redis <strong>Sorted Sets</strong> maintain rank order automatically. Adding or updating a score is O(log N).</p>

    <h2>Top ${players.length} of ${totalPlayers} Players</h2>
    <table>
      <tr><th>Rank</th><th>Player</th><th>Score</th></tr>
      ${rows}
    </table>

    <h2>Add or Update a Score</h2>
    <form method="POST" action="/leaderboard/score" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end">
      <div>
        <label class="dim">Player name (max ${MAX_NAME_LEN} chars)</label><br>
        <input name="player" placeholder="e.g. frank" maxlength="${MAX_NAME_LEN}" required>
      </div>
      <div>
        <label class="dim">Score (0 – ${MAX_SCORE.toLocaleString()})</label><br>
        <input name="score" type="number" min="0" max="${MAX_SCORE}" placeholder="e.g. 2000" required>
      </div>
      <button type="submit">Add / Update Score</button>
    </form>

    <h2>Redis Commands Used</h2>
    <pre>ZADD ${BOARD_KEY} 1200 "alice"   ← upsert score
ZREVRANGE ${BOARD_KEY} 0 9 WITHSCORES  ← top 10
ZRANK ${BOARD_KEY} "alice"         ← rank of one player
ZCARD ${BOARD_KEY}                 ← total players</pre>

    <h2>Why Sorted Sets?</h2>
    <p class="dim">
      You could store rankings in a SQL table and sort on every read — but at scale that's slow.
      Redis Sorted Sets keep members sorted <em>as you write them</em>, so reads are always fast
      regardless of dataset size. This is how games like Fortnite or apps like Duolingo power
      their live leaderboards.
    </p>
  `));
});

app.post('/leaderboard/score', async (req, res) => {
  const raw = req.body.player?.trim().toLowerCase() || '';
  const score = parseInt(req.body.score, 10);

  // Input validation
  if (!raw || raw.length > MAX_NAME_LEN) return res.redirect('/leaderboard');
  if (isNaN(score) || score < 0 || score > MAX_SCORE) return res.redirect('/leaderboard');
  // Allow only alphanumeric + underscore in player names
  if (!/^[a-z0-9_]+$/.test(raw)) return res.redirect('/leaderboard');

  await redis.zadd(BOARD_KEY, score, raw);
  res.redirect('/leaderboard');
});

// ─────────────────────────────────────────────
// INSPECT ALL KEYS
// ─────────────────────────────────────────────
app.get('/keys', async (req, res) => {
  const keys = await redis.keys('demo:*');
  keys.sort();

  const rows = await Promise.all(keys.map(async (key) => {
    const type = await redis.type(key);
    const ttl = await redis.ttl(key);
    const ttlLabel = ttl === -1 ? 'no expiry' : ttl === -2 ? 'expired' : `${ttl}s`;

    let value = '';
    if (type === 'string') value = esc(await redis.get(key));
    else if (type === 'zset') value = `${await redis.zcard(key)} members`;
    else value = `(${esc(type)})`;

    return `<tr><td><code>${esc(key)}</code></td><td>${esc(type)}</td><td>${ttlLabel}</td><td>${value}</td></tr>`;
  }));

  res.send(page('🔑 All Redis Keys', `
    <p>Every key written by this demo app, with its Redis data type and TTL.</p>
    <table>
      <tr><th>Key</th><th>Type</th><th>TTL</th><th>Value / Summary</th></tr>
      ${rows.length ? rows.join('') : '<tr><td colspan="4" style="color:#8b949e">No keys yet — visit the other pages first.</td></tr>'}
    </table>
    <p style="margin-top:16px"><a href="/keys">Refresh</a></p>
  `));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Redis Demo running at http://localhost:${PORT}`);
  console.log('   Visit the app to explore Redis patterns interactively.\n');
});
