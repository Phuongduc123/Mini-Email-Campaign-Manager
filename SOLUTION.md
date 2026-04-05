# Scalability Solutions — Mini Campaign Manager

This document describes every change made to address the scalability problems identified in `SCALABLE.md`, what was changed, and why.

---

## Table of Contents

1. [Phase 1 — Infrastructure: Redis + Dependencies](#phase-1--infrastructure-redis--dependencies)
2. [Phase 2 — Denormalized Stats Counters](#phase-2--denormalized-stats-counters)
3. [Phase 3 — BullMQ Job Queue + Worker Process](#phase-3--bullmq-job-queue--worker-process)
4. [Phase 4 — Cursor-Based Pagination](#phase-4--cursor-based-pagination)
5. [Phase 5 — Redis-Backed Rate Limiter](#phase-5--redis-backed-rate-limiter)
6. [How to Run](#how-to-run)
7. [API Contract Changes](#api-contract-changes)

---

## Phase 1 — Infrastructure: Redis + Dependencies

### Files changed
- `docker-compose.yml` — added `redis` service (port 6380) and `worker` service
- `packages/backend/package.json` — added `bullmq`, `ioredis`; removed `node-cron`, `@types/node-cron`; added `worker` and `worker:prod` scripts

### Problem solved
Redis is the backbone for all subsequent fixes. BullMQ requires Redis to persist job queues, and the rate limiter requires Redis to share counter state across multiple API instances. Without Redis, neither the job queue nor the distributed rate limiter can function.

The `worker` Docker Compose service runs the send worker as a separate container, completely isolated from the API server process.

---

## Phase 2 — Denormalized Stats Counters

### Files changed
- `packages/backend/src/database/models/Campaign.ts` — added `sentCount`, `failedCount`, `totalRecipients` columns (mapped to `sent_count`, `failed_count`, `total_recipients`)
- `packages/backend/src/shared/types/index.ts` — added `CursorPaginatedResult<T>` interface
- `packages/backend/src/shared/utils/response.ts` — added `sendCursorPaginated` response helper

### Problem solved

**Before** — `GET /campaigns/:id/stats` issued 4 separate `COUNT` queries on every request:

```sql
SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?
SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'sent'
SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'failed'
SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND opened_at IS NOT NULL
```

With 1 million recipients per campaign, these 4 scans run on every dashboard refresh, causing query timeouts under load.

**After** — `sent_count` and `failed_count` are incremented atomically by the send worker after each batch using Sequelize's `increment`:

```sql
UPDATE campaigns SET sent_count = sent_count + 200 WHERE id = ?
UPDATE campaigns SET failed_count = failed_count + 40 WHERE id = ?
```

Reading stats is now a single row read — **O(1)** instead of O(n). Only the `opened` count still requires a live `COUNT` query (no denormalized column for opens yet), reducing the stats request from 4 heavy scans to 1.

---

## Phase 3 — BullMQ Job Queue + Worker Process

This is the largest change, fixing the two **Critical** problems.

### Files changed
- `packages/backend/src/config/redis.ts` *(new)* — IORedis connection factory
- `packages/backend/src/config/index.ts` — added `redis` and `worker` config blocks
- `packages/backend/src/queue/index.ts` *(new)* — BullMQ Queue singleton with retry defaults
- `packages/backend/src/workers/campaign.worker.ts` *(new)* — standalone worker entry point
- `packages/backend/src/modules/campaigns/campaign.service.ts` — replaced `setImmediate(executeSend)` with `queue.add()`; replaced cron-based scheduling with BullMQ delayed jobs
- `packages/backend/src/modules/campaigns/campaign.scheduler.ts` — removed cron logic, replaced with a no-op stub

### Problem 1 solved — In-process send loop (Critical)

**Before:**

```
POST /send
  → setImmediate(executeSend)   ← runs inside the HTTP server process
  → return 202
```

Issues:
- If the server crashed mid-send, the campaign was stuck in `sending` with no recovery path.
- Sending 1M recipients saturated the same Node.js event loop that served HTTP requests, increasing API latency for all users.
- No retry mechanism — a transient DB error permanently failed the entire send.

**After:**

```
POST /send
  → queue.add({ campaignId })   ← job persisted in Redis
  → return 202 immediately

[Worker process — separate container]
  → picks up job
  → processes 200 recipients per batch
  → increments sent_count / failed_count atomically after each batch
  → if batch fails: BullMQ retries up to 3× with exponential backoff (5s → 25s → 125s)
  → if all retries exhausted: campaign reset to 'draft' for manual recovery
  → on success: campaign.status = 'sent'
```

The worker runs in a completely separate process. API latency is unaffected by send workload.

### Problem 2 solved — Race condition in scheduler (Critical)

**Before:**

A `node-cron` job ran every minute inside each API process:

```
Instance A tick: SELECT WHERE status='scheduled' AND scheduledAt <= now  → [campaign #5]
Instance B tick: SELECT WHERE status='scheduled' AND scheduledAt <= now  → [campaign #5]
  → Both dispatch executeSend(5)
  → Same campaign sent twice
```

Additionally, if the server was down when `scheduledAt` arrived, the campaign was silently skipped until the next restart.

**After:**

At schedule time, a BullMQ **delayed job** is enqueued with `delay = scheduledAt - Date.now()`:

```
POST /schedule
  → campaign.status = 'scheduled'
  → queue.add({ campaignId }, { jobId: 'campaign-5', delay: 3600000 })
      ↑ idempotent jobId — calling schedule twice won't create a duplicate job
```

BullMQ fires the job at the exact time via Redis. Only one worker instance ever picks up a given job — no polling, no race condition, no missed sends due to server downtime (the job stays in Redis until a worker processes it).

---

## Phase 4 — Cursor-Based Pagination

### Files changed

**Recipients:**
- `packages/backend/src/modules/recipients/recipient.schema.ts` — replaced `page` with `cursor`
- `packages/backend/src/modules/recipients/recipient.repository.ts` — replaced offset query with cursor query
- `packages/backend/src/modules/recipients/recipient.service.ts` — updated return type to `CursorPaginatedResult`
- `packages/backend/src/modules/recipients/recipient.controller.ts` — switched to `sendCursorPaginated`

**Campaigns:**
- `packages/backend/src/modules/campaigns/campaign.schema.ts` — replaced `page` with `cursor`
- `packages/backend/src/modules/campaigns/campaign.repository.ts` — replaced offset query with cursor query
- `packages/backend/src/modules/campaigns/campaign.controller.ts` — switched to `sendCursorPaginated`

### Problem solved

**Before** — offset-based pagination:

```sql
-- Page 1 (fast)
SELECT * FROM recipients ORDER BY id DESC LIMIT 20 OFFSET 0

-- Page 500 (slow — PostgreSQL must scan and discard 9,980 rows first)
SELECT * FROM recipients ORDER BY id DESC LIMIT 20 OFFSET 9980
```

Performance degrades linearly. Page 500 is ~500× slower than page 1. With 5M recipients and `GET /recipients` having no pagination at all, the endpoint would return the entire table and OOM the server.

**After** — cursor-based pagination using `id` as the cursor:

```sql
-- First page
SELECT * FROM recipients ORDER BY id DESC LIMIT 21

-- Next page (cursor = base64 of last seen id)
SELECT * FROM recipients WHERE id < 12345 ORDER BY id DESC LIMIT 21
```

This always hits the primary key index. Performance is **identical** whether you're on page 1 or page 10,000. Fetching one extra row (`limit + 1`) is the trick to detect whether more pages exist without a separate `COUNT(*)` query.

---

## Phase 5 — Redis-Backed Rate Limiter

### Files changed
- `packages/backend/src/middleware/rateLimiter.middleware.ts` — replaced in-memory `Map` with Redis `INCR` + `EXPIRE`; added `strictAuthRateLimiter`
- `packages/backend/src/modules/auth/auth.routes.ts` — applied `strictAuthRateLimiter` to `/register` and `/login`

### Problem solved

**Before** — in-memory `Map` per process:

```
Instance A memory: { "1.2.3.4": { count: 4, resetAt: ... } }
Instance B memory: { "1.2.3.4": { count: 1, resetAt: ... } }
```

An attacker could bypass the 10-request limit by rotating between API instances — each instance tracked its own counter independently. A server restart also wiped all counters, resetting the window.

**After** — shared Redis counter:

```
Redis key: ratelimit:1.2.3.4:928441  (windowBucket = floor(now / windowMs))
  INCR  → atomic, works identically across all API instances
  PEXPIRE → key auto-deletes after the window expires
```

All API instances share the same counters in Redis. Limits are enforced correctly regardless of how many servers are running.

Rate limits tightened:

| Endpoint | Before | After |
|----------|--------|-------|
| `/register` | 10 req / 15 min | **5 req / 15 min** |
| `/login` | 10 req / 15 min | **5 req / 15 min** |
| `/refresh` | 10 req / 15 min | 10 req / 15 min (unchanged) |

If Redis is temporarily unavailable, the limiter **fails open** (allows the request through) to avoid blocking legitimate traffic during infrastructure issues.

---

## How to Run

```bash
# Start PostgreSQL + Redis
docker-compose up -d postgres redis

# Run database migrations
yarn workspace backend migrate

# Start API server (terminal 1)
yarn backend

# Start send worker (terminal 2)
yarn workspace backend worker

# Or start everything with Docker Compose
docker-compose up
```

### Environment variables added

Copy `packages/backend/.env.example` and add:

```env
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=          # leave empty for local dev
WORKER_CONCURRENCY=5     # number of concurrent send jobs per worker process
```

---

## API Contract Changes

These are **breaking changes**. Clients must be updated.

### `GET /campaigns` and `GET /recipients`

**Before:**
```
GET /campaigns?page=2&limit=20
Response: {
  "data": [...],
  "meta": { "total": 100, "page": 2, "limit": 20, "totalPages": 5 }
}
```

**After:**
```
GET /campaigns?cursor=<token>&limit=20    ← first page: omit cursor
Response: {
  "data": [...],
  "meta": { "nextCursor": "MTIz", "hasMore": true }
}

GET /campaigns?cursor=MTIz&limit=20      ← subsequent pages: pass nextCursor
```

Pass `nextCursor` from the previous response as the `cursor` parameter of the next request. When `hasMore` is `false`, you have reached the last page.

---

*Solution version: 1.0 — written 2026-04-03*
