const express = require('express');
const Redis = require('ioredis');
const net = require('net');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

const esc = (str) => String(str)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) { const f = fwd.split(',')[0].trim(); if (net.isIP(f)) return f; }
  return req.socket.remoteAddress || '127.0.0.1';
}

// ─────────────────────────────────────────────
// DESIGN SYSTEM
// ─────────────────────────────────────────────
const CSS = `
  :root {
    --bg:#0d1117; --surface:#161b22; --surface2:#1c2128; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e;
    --blue:#58a6ff;   --blue-bg:rgba(88,166,255,.07);
    --green:#3fb950;  --green-bg:rgba(63,185,80,.07);
    --red:#f85149;    --red-bg:rgba(248,81,73,.07);
    --yellow:#d29922; --yellow-bg:rgba(210,153,34,.07);
    --purple:#bc8cff; --purple-bg:rgba(188,140,255,.07);
    --orange:#ffa657;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    background:var(--bg);color:var(--text);line-height:1.6;font-size:15px}

  /* ── Navigation ── */
  nav{background:var(--surface);border-bottom:1px solid var(--border);
    padding:0 24px;display:flex;align-items:center;gap:2px;
    position:sticky;top:0;z-index:10;overflow-x:auto}
  .nav-brand{font-weight:700;font-size:14px;color:var(--text);text-decoration:none;
    padding:14px 16px 14px 0;border-right:1px solid var(--border);margin-right:8px;
    white-space:nowrap;display:flex;align-items:center;gap:8px}
  nav a.ni{color:var(--muted);text-decoration:none;padding:14px 11px;font-size:13px;
    border-bottom:2px solid transparent;transition:color .15s,border-color .15s;
    white-space:nowrap;display:flex;align-items:center;gap:5px}
  nav a.ni:hover{color:var(--text)}
  nav a.ni.on{color:var(--blue);border-bottom-color:var(--blue)}

  /* ── Layout ── */
  .wrap{max-width:820px;margin:0 auto;padding:36px 20px 80px}

  /* ── Lesson header ── */
  .lh{display:flex;gap:20px;align-items:flex-start;padding:4px 0 28px}
  .lh-icon{font-size:56px;line-height:1;flex-shrink:0}
  .lh-num{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
    color:var(--blue);margin-bottom:5px}
  .lh-title{font-size:30px;font-weight:800;line-height:1.15;margin-bottom:7px}
  .lh-sub{color:var(--muted);font-size:15px;line-height:1.6}
  @media(max-width:540px){.lh{flex-direction:column;gap:10px}}

  /* ── Cards ── */
  .card{background:var(--surface);border:1px solid var(--border);
    border-radius:10px;padding:20px 22px;margin-bottom:14px}
  .card-problem {border-color:var(--red);   background:var(--red-bg)}
  .card-solution{border-color:var(--green); background:var(--green-bg)}
  .card-command {border-color:var(--blue);  background:var(--blue-bg)}
  .card-insight {border-color:var(--purple);background:var(--purple-bg)}
  .card-world   {border-color:var(--yellow);background:var(--yellow-bg)}
  .card-label{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
    margin-bottom:10px;display:flex;align-items:center;gap:6px}
  .card-problem  .card-label{color:var(--red)}
  .card-solution .card-label{color:var(--green)}
  .card-command  .card-label{color:var(--blue)}
  .card-insight  .card-label{color:var(--purple)}
  .card-world    .card-label{color:var(--yellow)}

  /* ── Steps ── */
  .step{display:flex;gap:14px;margin-bottom:14px;align-items:flex-start}
  .sn{width:26px;height:26px;border-radius:50%;background:var(--blue);color:#fff;
    font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;
    flex-shrink:0;margin-top:1px}
  .sb strong{color:var(--text);display:block;font-size:14px;margin-bottom:2px}
  .sb p{color:var(--muted);font-size:13px;margin:0;line-height:1.6}
  .sb code{font-size:12px}

  /* ── Flow diagram ── */
  .flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:14px 0;font-size:12px}
  .fn{padding:10px 14px;border-radius:8px;border:1px solid var(--border);
    background:var(--surface2);text-align:center;min-width:80px}
  .fn .nl{font-size:10px;color:var(--muted);margin-bottom:2px}
  .fn .nt{font-weight:700;font-size:13px}
  .fn.green{border-color:var(--green);background:var(--green-bg)}
  .fn.red  {border-color:var(--red);  background:var(--red-bg)}
  .fn.dim  {opacity:.3}
  .fa{color:var(--muted);font-size:18px;flex-shrink:0}

  /* ── Command block ── */
  .cmd-block{background:#010409;border:1px solid var(--border);border-radius:8px;
    padding:16px 20px;font-family:"SF Mono","Fira Code",Menlo,monospace;
    font-size:13px;line-height:2;overflow-x:auto;margin:8px 0}
  .cr{display:flex;gap:10px}
  .cp{color:var(--green);user-select:none;flex-shrink:0}
  .ret{color:var(--muted);font-style:italic;padding-left:22px;line-height:1.5;
    margin-bottom:6px;font-size:12px}
  .ck{color:var(--red);font-weight:700}       /* verb: SET GET INCR */
  .cn{color:var(--blue)}                       /* key name */
  .cv{color:var(--green)}                      /* value */
  .cm{color:var(--orange)}                     /* number */
  .cf{color:var(--purple)}                     /* flag: EX WITHSCORES */
  .cc{color:var(--muted)}                      /* comment */
  .annotation{color:var(--muted);font-size:11px;padding-left:22px;
    border-left:2px solid var(--border);margin:2px 0 10px 0;line-height:1.7}

  /* ── Big stat number ── */
  .stat{text-align:center;padding:36px;background:var(--surface);
    border:1px solid var(--border);border-radius:10px;margin-bottom:14px}
  .stat-num{font-size:88px;font-weight:800;line-height:1;
    font-variant-numeric:tabular-nums;margin-bottom:8px}
  .stat-num.blue  {color:var(--blue)}
  .stat-num.green {color:var(--green)}
  .stat-num.red   {color:var(--red)}
  .stat-label{color:var(--muted);font-size:14px}

  /* ── Progress bar ── */
  .pbar-wrap{margin:14px 0}
  .pbar-labels{display:flex;justify-content:space-between;
    font-size:13px;color:var(--muted);margin-bottom:7px}
  .pbar{height:10px;background:var(--surface2);border-radius:5px;
    overflow:hidden;border:1px solid var(--border)}
  .pbar-fill{height:100%;border-radius:5px;transition:width .3s}
  .fill-green {background:var(--green)}
  .fill-yellow{background:var(--yellow)}
  .fill-red   {background:var(--red)}

  /* ── Badges ── */
  .badge{display:inline-flex;align-items:center;gap:5px;padding:5px 13px;
    border-radius:20px;font-size:12px;font-weight:700}
  .b-green {background:rgba(63,185,80,.15); color:var(--green); border:1px solid rgba(63,185,80,.3)}
  .b-yellow{background:rgba(210,153,34,.15);color:var(--yellow);border:1px solid rgba(210,153,34,.3)}
  .b-red   {background:rgba(248,81,73,.15); color:var(--red);   border:1px solid rgba(248,81,73,.3)}
  .b-blue  {background:rgba(88,166,255,.15);color:var(--blue);  border:1px solid rgba(88,166,255,.3)}

  /* ── Table ── */
  table{border-collapse:collapse;width:100%;font-size:14px}
  th{background:var(--surface2);color:var(--muted);font-size:11px;text-transform:uppercase;
    letter-spacing:.06em;font-weight:700;padding:10px 14px;text-align:left}
  td{padding:12px 14px;border-top:1px solid var(--border);vertical-align:middle}
  tr:hover td{background:rgba(255,255,255,.02)}

  /* ── Buttons & forms ── */
  .form-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:14px 0}
  .ff label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px}
  input{background:var(--surface2);border:1px solid var(--border);color:var(--text);
    padding:9px 13px;border-radius:6px;font-size:14px;outline:none;transition:border-color .15s}
  input:focus{border-color:var(--blue)}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:6px;
    font-size:13px;font-weight:600;cursor:pointer;border:none;transition:opacity .15s;
    text-decoration:none;color:#fff}
  .btn:hover{opacity:.85}
  .btn-p{background:var(--blue)}
  .btn-s{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
  .btn-sm{padding:6px 12px;font-size:12px}

  /* ── Grid ── */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media(max-width:580px){.two-col{grid-template-columns:1fr}}

  /* ── Typography ── */
  h2{font-size:15px;font-weight:700;color:var(--text);margin:24px 0 10px}
  p{color:var(--muted);line-height:1.7;font-size:14px}
  strong{color:var(--text)}
  a{color:var(--blue);text-decoration:none}
  a:hover{text-decoration:underline}
  code{background:var(--surface2);padding:2px 6px;border-radius:4px;
    font-family:monospace;font-size:13px;border:1px solid var(--border)}
  hr{border:none;border-top:1px solid var(--border);margin:24px 0}

  /* ── Home grid ── */
  .home-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
  @media(max-width:580px){.home-grid{grid-template-columns:1fr}}
  .lcard{background:var(--surface);border:1px solid var(--border);border-radius:10px;
    padding:22px;text-decoration:none;display:block;transition:border-color .15s,transform .1s}
  .lcard:hover{border-color:var(--blue);transform:translateY(-2px);text-decoration:none}
  .lcard-icon{font-size:36px;margin-bottom:12px}
  .lcard-num{font-size:10px;font-weight:700;text-transform:uppercase;
    letter-spacing:.1em;color:var(--muted);margin-bottom:5px}
  .lcard-title{font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px}
  .lcard-desc{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:14px}
  .lcard-cmd{font-family:"SF Mono","Fira Code",monospace;font-size:12px;color:var(--blue);
    background:var(--blue-bg);padding:5px 10px;border-radius:5px;display:inline-block;
    border:1px solid rgba(88,166,255,.2)}

  /* ── Leaderboard ── */
  .rank-1 td:first-child{font-size:18px}
  .rank-1 .player-name{color:#ffd700;font-weight:700}
  .rank-2 .player-name{color:#c0c0c0;font-weight:600}
  .rank-3 .player-name{color:#cd7f32;font-weight:600}
  .score-bar{height:6px;background:var(--blue);border-radius:3px;display:inline-block;min-width:4px}

  /* ── Timing display ── */
  .timing-box{text-align:center;padding:28px 20px}
  .timing-num{font-size:64px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
  .timing-num.fast{color:var(--green)}
  .timing-num.slow{color:var(--red)}
  .timing-label{font-size:13px;color:var(--muted);margin-top:6px}

  /* ── Divider with label ── */
  .divider-label{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--muted);font-size:12px}
  .divider-label::before,.divider-label::after{content:'';flex:1;border-top:1px solid var(--border)}

  /* ── Inline tip ── */
  .tip{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--muted);
    line-height:1.6;margin:10px 0}
  .tip-icon{flex-shrink:0;font-size:16px;margin-top:1px}
`;

// ─────────────────────────────────────────────
// PAGE SHELL
// ─────────────────────────────────────────────
const page = (title, body, current = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} · Redis Lessons</title>
  <style>${CSS}</style>
</head>
<body>
<nav>
  <a href="/" class="nav-brand">⚡ Redis Lessons</a>
  <a href="/cache"       class="ni ${current==='cache'?'on':''}">📦 Caching</a>
  <a href="/counter"     class="ni ${current==='counter'?'on':''}">🔢 Counters</a>
  <a href="/rate-limit"  class="ni ${current==='ratelimit'?'on':''}">🚦 Rate Limit</a>
  <a href="/leaderboard" class="ni ${current==='leaderboard'?'on':''}">🏆 Leaderboard</a>
  <a href="/keys"        class="ni ${current==='keys'?'on':''}">🔑 Inspect</a>
</nav>
<div class="wrap">${body}</div>
</body>
</html>`;

// ─────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(page('Redis Lessons', `
    <div style="padding:12px 0 32px">
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700">Interactive Course</div>
      <h1 style="font-size:36px;font-weight:800;line-height:1.15;margin-bottom:14px">
        Learn Redis by doing,<br>not by reading docs.
      </h1>
      <p style="font-size:16px;max-width:540px;line-height:1.7">
        Redis is a database that lives in <strong>RAM instead of on disk</strong> — that makes it
        thousands of times faster than a regular database. These 4 lessons cover the patterns
        that power 90% of Redis usage in real apps.
      </p>
    </div>

    <div class="home-grid">
      <a href="/cache" class="lcard">
        <div class="lcard-icon">📦</div>
        <div class="lcard-num">Lesson 1</div>
        <div class="lcard-title">Caching</div>
        <div class="lcard-desc">
          Your database query takes 2 seconds. Redis answers the same question
          in under 1ms — by remembering the answer.
        </div>
        <div class="lcard-cmd">SET key value EX 30</div>
      </a>

      <a href="/counter" class="lcard">
        <div class="lcard-icon">🔢</div>
        <div class="lcard-num">Lesson 2</div>
        <div class="lcard-title">Atomic Counters</div>
        <div class="lcard-desc">
          50,000 users click "Like" simultaneously. Redis handles every single one
          correctly — no race conditions, no lost counts.
        </div>
        <div class="lcard-cmd">INCR page:views</div>
      </a>

      <a href="/rate-limit" class="lcard">
        <div class="lcard-icon">🚦</div>
        <div class="lcard-num">Lesson 3</div>
        <div class="lcard-title">Rate Limiting</div>
        <div class="lcard-desc">
          A bot is hammering your API with 10,000 requests per minute. Redis
          counts and blocks — and automatically resets the window.
        </div>
        <div class="lcard-cmd">INCR + EXPIRE</div>
      </a>

      <a href="/leaderboard" class="lcard">
        <div class="lcard-icon">🏆</div>
        <div class="lcard-num">Lesson 4</div>
        <div class="lcard-title">Leaderboards</div>
        <div class="lcard-desc">
          1 million players, always ranked by score. Redis Sorted Sets stay
          sorted as you write — no ORDER BY at read time.
        </div>
        <div class="lcard-cmd">ZADD leaderboard 1500 "alice"</div>
      </a>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-label">💡 How to use this app</div>
      <p>Each lesson is interactive — you trigger real Redis commands and see exactly what happens.
      Visit the <a href="/keys">🔑 Inspect</a> tab at any time to see every key currently stored in your Redis instance, its type, and when it expires.</p>
      <p style="margin-top:8px">Try this order: start with <strong>Caching</strong>, refresh the page twice to see the speed difference, then work through the rest in order.</p>
    </div>
  `));
});

// ─────────────────────────────────────────────
// LESSON 1 — CACHING
// ─────────────────────────────────────────────
app.get('/cache', async (req, res) => {
  const KEY = 'demo:expensive_query';
  const TTL = 30;
  const start = Date.now();
  const cached = await redis.get(KEY);

  if (cached) {
    const elapsed = Date.now() - start;
    const ttl = await redis.ttl(KEY);

    return res.send(page('Caching', `
      <div class="lh">
        <div class="lh-icon">📦</div>
        <div>
          <div class="lh-num">Lesson 1 of 4 · Caching</div>
          <div class="lh-title">The speed trick every app needs</div>
          <div class="lh-sub">Run an expensive operation once — serve the result instantly forever after.</div>
        </div>
      </div>

      <div class="card card-solution">
        <div class="card-label">✅ Cache hit — Redis answered</div>
        <div class="two-col" style="margin-top:8px">
          <div class="timing-box" style="border:1px solid var(--border);border-radius:8px;background:var(--surface2)">
            <div class="timing-num fast">${elapsed}ms</div>
            <div class="timing-label">Redis response time</div>
          </div>
          <div class="timing-box" style="border:1px solid var(--border);border-radius:8px;background:var(--surface2)">
            <div class="timing-num slow" style="font-size:48px">~2,000ms</div>
            <div class="timing-label">What the database would take</div>
          </div>
        </div>
        <p style="margin-top:14px">
          Redis returned the cached result <strong>without touching the database at all.</strong>
          The data expires in <strong>${ttl} seconds</strong> — after that, the next request refreshes it.
        </p>
      </div>

      <div class="divider-label">What's stored in Redis right now</div>

      <div class="card card-command">
        <div class="card-label">💻 Redis commands — what just happened</div>
        <div class="cmd-block">
          <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">GET</span> <span class="cn">demo:expensive_query</span></div>
          <div class="ret">→ "${esc(cached)}"</div>
          <div class="annotation">
            GET checks if the key exists in Redis.<br>
            It found it → this is a <strong style="color:var(--green)">cache hit</strong>.<br>
            Time taken: ${elapsed}ms. The database was never called.
          </div>
          <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">TTL</span> <span class="cn">demo:expensive_query</span></div>
          <div class="ret">→ ${ttl}  (seconds until this key auto-deletes)</div>
        </div>
      </div>

      <div class="card card-insight">
        <div class="card-label">💡 The key insight</div>
        <div class="step">
          <div class="sn">1</div>
          <div class="sb"><strong>First request = cache miss</strong>
            <p>The key doesn't exist. Your app goes to the database (slow), gets the result, and stores it in Redis with a timer.</p>
          </div>
        </div>
        <div class="step">
          <div class="sn">2</div>
          <div class="sb"><strong>Every request after that = cache hit</strong>
            <p>Redis answers in microseconds. The database is not involved. You can have 1 user or 1 million — same speed.</p>
          </div>
        </div>
        <div class="step">
          <div class="sn">3</div>
          <div class="sb"><strong>TTL handles the refresh automatically</strong>
            <p>When the timer runs out, the key disappears. The next request becomes a cache miss again, refreshing the data. No cleanup job needed.</p>
          </div>
        </div>
      </div>

      <div class="card card-world">
        <div class="card-label">🌍 Where you've seen this</div>
        <p>
          <strong>Netflix</strong> caches movie metadata so millions of people can see the same page without hitting Postgres each time.
          <strong>Shopify</strong> caches product pages. <strong>GitHub</strong> caches repository stats.
          If a piece of data doesn't change every second, caching it is almost always worth it.
        </p>
        <p style="margin-top:8px">
          <a href="/cache/clear">→ Clear the cache</a> to see the 2-second miss again.
          Then refresh — you'll see the hit happen instantly.
        </p>
      </div>
    `, 'cache'));
  }

  // ── Cache miss path ──────────────────────────────────────
  await new Promise(r => setTimeout(r, 2000));
  const freshData = `user_count=4821, revenue=98234.50, fetched_at=${new Date().toISOString()}`;
  await redis.set(KEY, freshData, 'EX', TTL);
  const elapsed = Date.now() - start;

  res.send(page('Caching', `
    <div class="lh">
      <div class="lh-icon">📦</div>
      <div>
        <div class="lh-num">Lesson 1 of 4 · Caching</div>
        <div class="lh-title">The speed trick every app needs</div>
        <div class="lh-sub">Run an expensive operation once — serve the result instantly forever after.</div>
      </div>
    </div>

    <div class="card card-problem">
      <div class="card-label">🔴 Cache miss — database was called</div>
      <div class="two-col" style="margin-top:8px">
        <div class="timing-box" style="border:1px solid var(--border);border-radius:8px;background:var(--surface2)">
          <div class="timing-num slow">${elapsed}ms</div>
          <div class="timing-label">Database response time</div>
        </div>
        <div class="timing-box" style="border:1px solid var(--border);border-radius:8px;background:var(--surface2)">
          <div class="timing-num green" style="font-size:48px">&lt;1ms</div>
          <div class="timing-label">What Redis will take next time</div>
        </div>
      </div>
      <p style="margin-top:14px">
        The key didn't exist in Redis, so we waited for the (simulated) database. That took
        <strong>${elapsed}ms</strong>. The result is now stored in Redis for ${TTL} seconds.
      </p>
    </div>

    <div class="divider-label">What just happened in Redis</div>

    <div class="card card-command">
      <div class="card-label">💻 Redis commands — step by step</div>
      <div class="cmd-block">
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">GET</span> <span class="cn">demo:expensive_query</span></div>
        <div class="ret">→ (nil)  ← key doesn't exist, this is a cache miss</div>
        <div class="annotation">
          Redis checked for the key. It wasn't there.<br>
          So the app had to go to the (slow) database instead.
        </div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">SET</span> <span class="cn">demo:expensive_query</span> <span class="cv">"${esc(freshData)}"</span> <span class="cf">EX</span> <span class="cm">${TTL}</span></div>
        <div class="ret">→ OK</div>
        <div class="annotation">
          Now we store the result with a ${TTL}-second timer.<br>
          <span class="cf">EX ${TTL}</span> = "delete this key automatically after ${TTL} seconds".<br>
          Every request for the next ${TTL}s will get this from Redis instead of the database.
        </div>
      </div>
    </div>

    <div class="card card-insight">
      <div class="card-label">💡 Now try the cache hit</div>
      <p>
        <a href="/cache">Refresh this page →</a> The next request will be served by Redis
        in under 1ms. You'll see the timing jump from ~${elapsed}ms to &lt;1ms. <strong>That's caching.</strong>
      </p>
      <div class="flow" style="margin-top:16px">
        <div class="fn red"><div class="nl">Now (miss)</div><div class="nt">Database</div></div>
        <div class="fa">→</div>
        <div class="fn"><div class="nl">Hit the</div><div class="nt">Database 💾</div></div>
        <div class="fa">→</div>
        <div class="fn green"><div class="nl">Store in</div><div class="nt">Redis ⚡</div></div>
        <br style="flex-basis:100%">
        <div class="fn green"><div class="nl">Next time (hit)</div><div class="nt">Redis ⚡</div></div>
        <div class="fa">→</div>
        <div class="fn green"><div class="nl">Response</div><div class="nt">&lt;1ms</div></div>
        <div class="fa dim">→</div>
        <div class="fn dim"><div class="nl">Database</div><div class="nt">skipped</div></div>
      </div>
    </div>
  `, 'cache'));
});

app.get('/cache/clear', async (req, res) => {
  await redis.del('demo:expensive_query');
  res.redirect('/cache');
});

// ─────────────────────────────────────────────
// LESSON 2 — ATOMIC COUNTERS
// ─────────────────────────────────────────────
app.get('/counter', async (req, res) => {
  const visits = await redis.incr('demo:counter:visits');
  let stock = await redis.get('demo:counter:stock');
  if (stock === null) { await redis.set('demo:counter:stock', 100); stock = 100; }
  const stockNum = parseInt(stock, 10);
  const stockPct = Math.max(0, Math.min(100, stockNum));
  const fillClass = stockPct > 50 ? 'fill-green' : stockPct > 20 ? 'fill-yellow' : 'fill-red';

  res.send(page('Counters', `
    <div class="lh">
      <div class="lh-icon">🔢</div>
      <div>
        <div class="lh-num">Lesson 2 of 4 · Atomic Counters</div>
        <div class="lh-title">Counting without race conditions</div>
        <div class="lh-sub">Redis makes counting atomic — correct under any load, no locks needed.</div>
      </div>
    </div>

    <div class="card card-problem">
      <div class="card-label">🔴 The problem with normal databases</div>
      <p>
        Imagine 50,000 users click "Like" at the exact same moment.
        A normal counter works like this: <strong>read</strong> the current count →
        <strong>add 1</strong> → <strong>write</strong> it back.
      </p>
      <p style="margin-top:8px">
        Under heavy traffic, two requests can read the <em>same</em> value before either
        writes back. Both write "count + 1" — and one like is silently lost.
        This is called a <strong>race condition</strong>.
      </p>
    </div>

    <div class="stat">
      <div class="stat-num blue">${visits.toLocaleString()}</div>
      <div class="stat-label">times this page has been loaded — every single one counted correctly</div>
    </div>

    <div class="card card-command">
      <div class="card-label">💻 What Redis did when you loaded this page</div>
      <div class="cmd-block">
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">INCR</span> <span class="cn">demo:counter:visits</span></div>
        <div class="ret">→ ${visits}  ← the new value, returned atomically</div>
        <div class="annotation">
          INCR is one single operation, not three steps.<br>
          Redis guarantees no two calls get the same value — ever.<br>
          Run this 1 million times concurrently → every number 1–1,000,000 appears exactly once.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-label" style="color:var(--text)">🧪 Try it: adjust stock level</div>
      <p>This shows <code>INCRBY</code> and <code>DECRBY</code> — same atomic guarantee, different amounts.</p>

      <div class="pbar-wrap" style="margin-top:14px">
        <div class="pbar-labels">
          <span>Stock</span>
          <strong>${stockNum} / 100 units</strong>
        </div>
        <div class="pbar">
          <div class="pbar-fill ${fillClass}" style="width:${stockPct}%"></div>
        </div>
      </div>

      <div class="form-row">
        <form method="POST" action="/counter/stock">
          <input type="hidden" name="delta" value="-10">
          <button class="btn btn-s btn-sm" type="submit">− Sell 10 units</button>
        </form>
        <form method="POST" action="/counter/stock">
          <input type="hidden" name="delta" value="25">
          <button class="btn btn-p btn-sm" type="submit">+ Restock 25 units</button>
        </form>
        <form method="POST" action="/counter/stock">
          <input type="hidden" name="reset" value="true">
          <button class="btn btn-s btn-sm" type="submit">↺ Reset to 100</button>
        </form>
      </div>

      <div class="cmd-block">
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">DECRBY</span> <span class="cn">demo:counter:stock</span> <span class="cm">10</span></div>
        <div class="ret">→ ${Math.max(0, stockNum - 10)}  ← new value after selling 10</div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">INCRBY</span> <span class="cn">demo:counter:stock</span> <span class="cm">25</span></div>
        <div class="ret">→ ${stockNum + 25}  ← new value after restocking 25</div>
      </div>
    </div>

    <div class="card card-insight">
      <div class="card-label">💡 The key insight — atomicity</div>
      <p>
        <code>INCR</code> is a single CPU instruction inside Redis — not "read, then add, then write."
        That's what <strong>atomic</strong> means: it cannot be interrupted mid-way.
        No matter how many concurrent requests hit Redis, each gets a unique, correct count.
      </p>
    </div>

    <div class="card card-world">
      <div class="card-label">🌍 Where you've seen this</div>
      <p>
        <strong>YouTube</strong> view counts, <strong>Instagram</strong> likes,
        <strong>Stripe</strong> API usage meters, <strong>Steam</strong> concurrent player counts.
        Any number that goes up (or down) under heavy traffic is a candidate for Redis counters.
      </p>
    </div>
  `, 'counter'));
});

app.post('/counter/stock', async (req, res) => {
  if (req.body.reset) {
    await redis.set('demo:counter:stock', 100);
  } else {
    const delta = parseInt(req.body.delta, 10);
    if (isNaN(delta) || delta < -1000 || delta > 1000) return res.redirect('/counter');
    await redis.incrby('demo:counter:stock', delta);
  }
  res.redirect('/counter');
});

// ─────────────────────────────────────────────
// LESSON 3 — RATE LIMITING
// ─────────────────────────────────────────────
app.get('/rate-limit', async (req, res) => {
  const ip = getClientIp(req);
  const key = `demo:ratelimit:${ip}`;
  const LIMIT = 5;
  const WINDOW = 30;

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW);
  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, LIMIT - count);
  const blocked = count > LIMIT;
  const usedPct = Math.min(100, (count / LIMIT) * 100);
  const fillClass = usedPct < 60 ? 'fill-green' : usedPct < 100 ? 'fill-yellow' : 'fill-red';

  res.send(page('Rate Limiting', `
    <div class="lh">
      <div class="lh-icon">🚦</div>
      <div>
        <div class="lh-num">Lesson 3 of 4 · Rate Limiting</div>
        <div class="lh-title">The bouncer at the door</div>
        <div class="lh-sub">Count requests per user. Block when they go too fast. Auto-reset when the window expires.</div>
      </div>
    </div>

    <div class="card card-problem">
      <div class="card-label">🔴 The problem without rate limiting</div>
      <p>
        A single bot can send thousands of login attempts per minute — trying stolen password lists
        against your users. Or a poorly written client can accidentally DDoS your own API.
        Without a gate, there's nothing to stop it.
      </p>
    </div>

    <div class="card ${blocked ? 'card-problem' : 'card-solution'}">
      <div class="card-label">${blocked ? '🚫 Request blocked' : '✅ Request allowed'}</div>

      <div class="pbar-wrap">
        <div class="pbar-labels">
          <span>Requests used this window</span>
          <strong>${Math.min(count, LIMIT)} / ${LIMIT}</strong>
        </div>
        <div class="pbar">
          <div class="pbar-fill ${fillClass}" style="width:${usedPct}%"></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px;text-align:center">
        <div class="card" style="padding:14px;margin:0">
          <div style="font-size:28px;font-weight:800;color:${blocked ? 'var(--red)' : 'var(--green)'}">${Math.min(count, LIMIT)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">requests used</div>
        </div>
        <div class="card" style="padding:14px;margin:0">
          <div style="font-size:28px;font-weight:800;color:var(--blue)">${remaining}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">remaining</div>
        </div>
        <div class="card" style="padding:14px;margin:0">
          <div style="font-size:28px;font-weight:800;color:var(--muted)">${ttl}s</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">until reset</div>
        </div>
      </div>

      ${blocked
        ? `<p style="margin-top:14px">You've exceeded <strong>${LIMIT} requests in ${WINDOW} seconds</strong>.
           The window resets automatically in <strong>${ttl}s</strong> — no action needed on your part.</p>`
        : `<p style="margin-top:14px"><a href="/rate-limit">Make another request →</a> Keep clicking until you hit the limit and see what gets blocked.</p>`
      }
    </div>

    <div class="card card-command">
      <div class="card-label">💻 What Redis did on this request</div>
      <div class="cmd-block">
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">INCR</span> <span class="cn">demo:ratelimit:&lt;your-ip&gt;</span></div>
        <div class="ret">→ ${count}  ← total requests in this window</div>
        <div class="annotation">
          Atomically increments the counter for your IP address.<br>
          ${count === 1
            ? 'This was the first request — we also set the expiry timer:'
            : `Counter is now ${count}. ${blocked ? `That's over the limit of ${LIMIT} — blocked.` : `Still under the limit of ${LIMIT} — allowed.`}`
          }
        </div>
        ${count === 1 ? `
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">EXPIRE</span> <span class="cn">demo:ratelimit:&lt;your-ip&gt;</span> <span class="cm">${WINDOW}</span></div>
        <div class="ret">→ 1  ← timer set (only called on first request in a window)</div>
        <div class="annotation">
          We only call EXPIRE once — on the first request. This starts the ${WINDOW}-second window.<br>
          When the timer runs out, Redis deletes the key. The next request starts a fresh window.
        </div>
        ` : `
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">TTL</span> <span class="cn">demo:ratelimit:&lt;your-ip&gt;</span></div>
        <div class="ret">→ ${ttl}  ← seconds until this window resets automatically</div>
        `}
      </div>
    </div>

    <div class="card card-insight">
      <div class="card-label">💡 The clever trick — EXPIRE does the cleanup</div>
      <div class="step">
        <div class="sn">1</div>
        <div class="sb"><strong>First request: INCR + EXPIRE</strong>
          <p>Increment the counter, then set a timer. The timer only runs once — on the first request of each window.</p>
        </div>
      </div>
      <div class="step">
        <div class="sn">2</div>
        <div class="sb"><strong>Subsequent requests: INCR only</strong>
          <p>Check if the counter is over the limit. No need to reset anything — the timer is already running.</p>
        </div>
      </div>
      <div class="step">
        <div class="sn">3</div>
        <div class="sb"><strong>Window ends: Redis deletes the key automatically</strong>
          <p>No cron job. No scheduled cleanup. Redis just deletes the key when the timer expires. The next request starts a fresh window at count = 1.</p>
        </div>
      </div>
    </div>

    <div class="card card-world">
      <div class="card-label">🌍 Where you've seen this</div>
      <p>
        <strong>GitHub API</strong> allows 5,000 requests/hour per token.
        <strong>Twilio</strong> rate-limits SMS sending to prevent abuse.
        <strong>Banks</strong> limit login attempts to prevent brute-force attacks.
        <strong>Stripe</strong> uses it per API key to prevent runaway billing.
      </p>
    </div>
  `, 'ratelimit'));
});

// ─────────────────────────────────────────────
// LESSON 4 — LEADERBOARD (Sorted Sets)
// ─────────────────────────────────────────────
const BOARD = 'demo:leaderboard';
const MAX_NAME = 30;
const MAX_SCORE = 999_999;

async function seedLeaderboard() {
  if (!await redis.exists(BOARD)) {
    await redis.zadd(BOARD, 1200,'alice', 980,'bob', 1450,'carol', 670,'dave', 1100,'eve');
  }
}

app.get('/leaderboard', async (req, res) => {
  await seedLeaderboard();
  const raw = await redis.zrevrange(BOARD, 0, 9, 'WITHSCORES');
  const players = [];
  for (let i = 0; i < raw.length; i += 2) {
    players.push({ rank: players.length + 1, name: raw[i], score: parseInt(raw[i + 1]) });
  }
  const totalPlayers = await redis.zcard(BOARD);
  const maxScore = players[0]?.score || 1;
  const medals = ['🥇','🥈','🥉'];

  const rows = players.map(p => `
    <tr class="rank-${p.rank}">
      <td style="font-size:18px;width:40px">${medals[p.rank-1] || `<span style="color:var(--muted)">${p.rank}</span>`}</td>
      <td class="player-name">${esc(p.name)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-variant-numeric:tabular-nums;font-weight:600">${p.score.toLocaleString()}</span>
          <div class="score-bar" style="width:${Math.round((p.score/maxScore)*120)}px"></div>
        </div>
      </td>
    </tr>
  `).join('');

  res.send(page('Leaderboard', `
    <div class="lh">
      <div class="lh-icon">🏆</div>
      <div>
        <div class="lh-num">Lesson 4 of 4 · Sorted Sets</div>
        <div class="lh-title">Always-ranked data — for free</div>
        <div class="lh-sub">Redis keeps members sorted by score as you write them. Reads are always instant.</div>
      </div>
    </div>

    <div class="card card-problem">
      <div class="card-label">🔴 The problem at scale</div>
      <p>
        You have 1 million players and need to show the top 100 by score. In a SQL database
        that's: <code>SELECT * FROM players ORDER BY score DESC LIMIT 100</code>.
        Sorting 1 million rows on every page load gets painfully slow as you grow.
      </p>
      <p style="margin-top:8px">
        Redis Sorted Sets maintain the order <strong>as you write each score</strong>.
        The top-100 read is always O(log N) — fast whether you have 100 or 100 million players.
      </p>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div><strong>Top ${players.length}</strong> <span style="color:var(--muted);font-size:13px">of ${totalPlayers} players</span></div>
        <span class="badge b-blue">${totalPlayers} total members</span>
      </div>
      <table>
        <thead><tr><th style="width:40px">#</th><th>Player</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-label" style="color:var(--text)">🧪 Add or update a score</div>
      <p>Try submitting a name that already exists — Redis will update the score, not duplicate the entry. Then check where they appear in the ranking.</p>
      <form method="POST" action="/leaderboard/score">
        <div class="form-row">
          <div class="ff">
            <label>Player name (letters, numbers, _ — max ${MAX_NAME})</label>
            <input name="player" placeholder="e.g. frank" maxlength="${MAX_NAME}" required
              pattern="[a-zA-Z0-9_]+" title="Letters, numbers and underscores only">
          </div>
          <div class="ff">
            <label>Score (0 – ${MAX_SCORE.toLocaleString()})</label>
            <input name="score" type="number" min="0" max="${MAX_SCORE}" placeholder="e.g. 2000" required>
          </div>
          <button class="btn btn-p" type="submit">Add / Update →</button>
        </div>
      </form>
    </div>

    <div class="card card-command">
      <div class="card-label">💻 The commands powering this leaderboard</div>
      <div class="cmd-block">
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">ZADD</span> <span class="cn">demo:leaderboard</span> <span class="cm">1500</span> <span class="cv">"alice"</span></div>
        <div class="ret">→ 1  (added) or 0 (updated score)</div>
        <div class="annotation">
          Adds "alice" with score 1500. If alice already exists, her score is updated.<br>
          Redis re-sorts immediately — O(log N) insert.
        </div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">ZREVRANGE</span> <span class="cn">demo:leaderboard</span> <span class="cm">0</span> <span class="cm">9</span> <span class="cf">WITHSCORES</span></div>
        <div class="ret">→ ["carol","1450","alice","1200","eve","1100","bob","980","dave","670"]</div>
        <div class="annotation">
          Returns top 10 members, highest score first, with their scores.<br>
          REV = reversed (highest first). Range 0–9 = first 10 results.
        </div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">ZREVRANK</span> <span class="cn">demo:leaderboard</span> <span class="cv">"alice"</span></div>
        <div class="ret">→ 1  ← alice is rank #2 (0-indexed from the top)</div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">ZCARD</span> <span class="cn">demo:leaderboard</span></div>
        <div class="ret">→ ${totalPlayers}  ← total number of members</div>
      </div>
    </div>

    <div class="card card-insight">
      <div class="card-label">💡 The key insight — sorted on write, not on read</div>
      <p>
        Every time you call <code>ZADD</code>, Redis inserts the member into a skip list
        data structure that is <em>always sorted</em>. Reading the top-N is never a sort operation —
        it's just walking a pre-ordered list. The leaderboard stays fast forever.
      </p>
    </div>

    <div class="card card-world">
      <div class="card-label">🌍 Where you've seen this</div>
      <p>
        <strong>Fortnite</strong> and <strong>Call of Duty</strong> real-time kill leaderboards.
        <strong>Duolingo</strong> weekly XP rankings that reset every Sunday.
        <strong>Hacker News</strong> story rankings (votes minus time decay = score).
        Any time you see a live "top N" list updating in real time, Redis is probably behind it.
      </p>
    </div>
  `, 'leaderboard'));
});

app.post('/leaderboard/score', async (req, res) => {
  const raw = req.body.player?.trim().toLowerCase() || '';
  const score = parseInt(req.body.score, 10);
  if (!raw || raw.length > MAX_NAME) return res.redirect('/leaderboard');
  if (isNaN(score) || score < 0 || score > MAX_SCORE) return res.redirect('/leaderboard');
  if (!/^[a-z0-9_]+$/.test(raw)) return res.redirect('/leaderboard');
  await redis.zadd(BOARD, score, raw);
  res.redirect('/leaderboard');
});

// ─────────────────────────────────────────────
// INSPECT ALL KEYS
// ─────────────────────────────────────────────
app.get('/keys', async (req, res) => {
  const keys = await redis.keys('demo:*');
  keys.sort();

  const TYPE_COLOR = { string:'var(--blue)', zset:'var(--purple)', list:'var(--orange)', hash:'var(--green)', set:'var(--yellow)' };
  const TYPE_DESC  = { string:'A single text or number value', zset:'A set of members ranked by score', list:'An ordered list', hash:'A dictionary of fields', set:'An unordered unique collection' };

  const rows = await Promise.all(keys.map(async (key) => {
    const type = await redis.type(key);
    const ttl  = await redis.ttl(key);
    const ttlLabel = ttl === -1 ? '<span style="color:var(--muted)">no expiry</span>'
                   : ttl === -2 ? '<span style="color:var(--red)">expired</span>'
                   : `<strong style="color:var(--yellow)">${ttl}s</strong>`;
    let value = '';
    if (type === 'string') value = esc(await redis.get(key));
    else if (type === 'zset') value = `${await redis.zcard(key)} members`;
    else value = `(${esc(type)})`;
    const col = TYPE_COLOR[type] || 'var(--muted)';
    return `<tr>
      <td><code style="color:var(--blue)">${esc(key)}</code></td>
      <td><span style="color:${col};font-weight:600;font-size:12px;text-transform:uppercase">${esc(type)}</span>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${TYPE_DESC[type] || ''}</div></td>
      <td>${ttlLabel}</td>
      <td style="font-size:13px;color:var(--muted);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${value}</td>
    </tr>`;
  }));

  res.send(page('Inspect Redis', `
    <div class="lh">
      <div class="lh-icon">🔑</div>
      <div>
        <div class="lh-num">Peek behind the curtain</div>
        <div class="lh-title">Every key in Redis, right now</div>
        <div class="lh-sub">This is your live Redis state. Visit the lessons and watch keys appear and expire.</div>
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Type</th>
            <th>TTL (time to live)</th>
            <th>Value / Summary</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.join('')
            : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:32px">
                No keys yet — visit the lessons to create some.
              </td></tr>`
          }
        </tbody>
      </table>
    </div>

    <div class="card card-command">
      <div class="card-label">💻 Commands used on this page</div>
      <div class="cmd-block">
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">KEYS</span> <span class="cv">demo:*</span></div>
        <div class="ret">→ list of all keys matching the "demo:" prefix</div>
        <div class="annotation">Scans for keys by pattern. Fine for demos — in production, use SCAN instead to avoid blocking.</div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">TYPE</span> <span class="cn">&lt;key&gt;</span></div>
        <div class="ret">→ string / zset / list / hash / set</div>
        <div class="cr"><span class="cp">redis&gt;</span> <span class="ck">TTL</span> <span class="cn">&lt;key&gt;</span></div>
        <div class="ret">→ seconds remaining (-1 = no expiry, -2 = expired/gone)</div>
      </div>
    </div>

    <div class="tip">
      <div class="tip-icon">💡</div>
      <div>
        <strong style="color:var(--text)">TTL is the number of seconds until Redis deletes the key automatically.</strong>
        Watch the rate-limit key count down in real time by refreshing this page.
        When it hits 0, Redis removes the key and the next request starts a fresh window.
      </div>
    </div>

    <p style="margin-top:16px"><a href="/keys">↺ Refresh to see the latest state</a></p>
  `, 'keys'));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Redis Lessons running at http://localhost:${PORT}\n`);
});
