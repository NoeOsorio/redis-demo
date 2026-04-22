# Redis — A Human's Manual

## What is Redis?

Think of Redis as a whiteboard that your app writes on and reads from extremely fast. Unlike a regular database that saves everything to disk (which takes time), Redis keeps everything in RAM — the same memory your computer uses to run apps. Reading from RAM is thousands of times faster than reading from disk.

The tradeoff: if the server restarts, the whiteboard gets erased — unless you configure it to save snapshots to disk. By default, it's volatile on purpose. Redis is designed to hold data that is *fast to get* and *okay to lose*.

**When to use Redis:** when you need speed and the data is either temporary or safely reproducible from another source (like a database).

---

## The 4 patterns in this app

### 1. Caching — "Remember the answer so you don't repeat the work"

**The problem:** Your database query takes 2 seconds and 10,000 users are asking for the same data every minute. That's 2 seconds × 10,000 = a lot of wasted work.

**What Redis does:** You run the query once, write the result to Redis, and tell it "delete this in 30 seconds" (a TTL — Time To Live). For the next 30 seconds, everyone gets the answer instantly from Redis. When the TTL runs out, Redis deletes the key automatically and the next request refreshes it.

**Commands:**
```
SET my-key "the answer" EX 30    ← store with a 30-second expiry
GET my-key                        ← get it back (returns nil if expired)
```

**Real-world examples:** Shopify caching product pages, Twitter caching your timeline, any API that fetches the same data over and over.

---

### 2. Counters — "Counting without collisions"

**The problem:** 50,000 users click "Like" at the same moment. A normal database does: read the count → add 1 → write it back. Under heavy traffic, two reads happen before any write lands, so some likes get silently dropped. This is called a race condition.

**What Redis does:** `INCR` is atomic — it does the whole read-add-write as a single indivisible step. No matter how many requests arrive at once, every one gets a unique correct count.

**Commands:**
```
INCR page:views           ← add 1, get the new value back
INCRBY stock -10          ← subtract 10 (INCRBY with negative)
DECRBY stock 10           ← same thing, more readable
SET stock 100             ← reset to a specific value
```

**Real-world examples:** YouTube view counts, Instagram likes, Stripe API usage meters, video game score tracking.

---

### 3. Rate Limiting — "Slow down, you're going too fast"

**The problem:** A bot is hammering your login endpoint with 10,000 attempts per minute. You want to allow only 5 attempts per IP address per 30 seconds and then block them.

**What Redis does:** On each request, you increment a counter for that IP and set a 30-second TTL on it. When the counter hits your limit, you return an error. When the TTL runs out, Redis deletes the key automatically — no cleanup cron job needed.

**Commands:**
```
INCR ratelimit:1.2.3.4         ← count this request (returns new count)
EXPIRE ratelimit:1.2.3.4 30    ← auto-delete after 30 seconds
TTL ratelimit:1.2.3.4          ← how many seconds remain in this window
```

**Trick:** You only call `EXPIRE` when the counter is exactly 1 (the first request in a window). That way you don't accidentally reset the timer on every request.

**Real-world examples:** GitHub API rate limiting, bank login attempt limits, SMS code throttling, API subscription tiers.

---

### 4. Leaderboards — "Who's winning, right now"

**The problem:** You have 1 million players and need to show the top 100 by score. Running `SELECT * FROM players ORDER BY score DESC LIMIT 100` on a million-row table on every page load gets slow fast.

**What Redis does:** A Sorted Set stores every player with a numeric score. Redis keeps them ranked *as you insert them* — you never do a sort at read time. Fetching the top 100 is always fast, whether you have 100 or 10 million players.

**Commands:**
```
ZADD leaderboard 1500 "alice"          ← add or update alice's score
ZADD leaderboard 980 "bob"             ← add bob
ZREVRANGE leaderboard 0 9 WITHSCORES   ← top 10 (highest first), with scores
ZRANK leaderboard "alice"              ← alice's rank (0-indexed from bottom)
ZREVRANK leaderboard "alice"           ← alice's rank (0-indexed from top)
ZSCORE leaderboard "alice"             ← just alice's score
ZCARD leaderboard                      ← total number of players
```

**Real-world examples:** Fortnite and Call of Duty leaderboards, Duolingo XP rankings, sales team dashboards, Hacker News vote sorting.

---

## Common mistakes

### "I'll use Redis for everything"
Redis is a *complement*, not a replacement. Don't store your primary records in Redis — use it for fast, temporary data in front of your main database (usually Postgres or MySQL). Redis and Postgres together is the classic combo: Postgres is the source of truth, Redis is the fast lane in front of it.

### "I forgot the TTL"
If you cache data without a TTL, it lives in Redis forever. Memory fills up, stale data accumulates, and you get production bugs that are hard to trace. Always set `EX` on cached values.

### "Redis went down and everything broke"
Build your app to degrade gracefully. If the cache is unavailable, fall back to the database (slower but still works). If the rate limiter is unavailable, decide explicitly: fail open (allow the request) or fail closed (deny it). Pick one and make it intentional.

### "I stored passwords in Redis"
Redis stores data in plaintext in memory. Anyone who can run `redis-cli` on that server can read everything. Never store passwords, payment card numbers, or sensitive PII in Redis without encrypting them first. Use it for derived, temporary, or non-sensitive data.

### "My TTL just vanished"
If you run `SET` on a key that already has a TTL, the new `SET` *removes the TTL* unless you include `EX` again. Always include the expiry when overwriting cached keys.

---

## Redis data types at a glance

| Type | What it's like | Best for |
|---|---|---|
| String | A variable | Counters, cached values, flags |
| List | An array | Job queues, activity feeds |
| Set | A unique collection | Unique visitors, tags |
| Sorted Set | A ranked set | Leaderboards, priority queues |
| Hash | A mini object | User profiles, settings |
| Stream | An append-only log | Event sourcing, message queues |

This app uses **String** (cache, counter) and **Sorted Set** (leaderboard).

---

## When NOT to use Redis

- You need data to survive restarts without extra configuration → use Postgres
- Your data has relationships and you need JOINs → use Postgres
- You need ACID transactions across multiple tables → use Postgres
- Your dataset is larger than your available RAM → use Postgres with good indexes
- You need full-text search → use Postgres with pg_trgm or Elasticsearch

Redis answers "give me this fast." Postgres answers "give me this correctly and permanently."
