# Scalability Analysis — Mini Campaign Manager

Analysis of the main performance and scalability problems this application will face as it grows.

---

## Table of Contents

1. [Critical Problems](#1-critical-problems)
2. [High Priority Problems](#2-high-priority-problems)
3. [Medium Priority Problems](#3-medium-priority-problems)
4. [Low Priority (Infrastructure)](#4-low-priority-infrastructure)
5. [Priority Summary](#5-priority-summary)

---

## 1. Critical Problems

### 1.1 Async Send — Single Process, No Queue

> Requirement: *"Each CampaignRecipient is randomly marked `sent` or `failed`, `sent_at` recorded"*

The send is simulated in a single async loop inside `send.service.ts`. At scale:

- 1 campaign × 1M recipients = 1M sequential DB writes in one Node.js process
- No worker concurrency, no backpressure, no retry coordination
- Process crashes mid-send → no recovery mechanism → partial state with no way to resume cleanly

**Fix:** A proper job queue (BullMQ, pg_boss) with batched updates and idempotent workers.

```
Current:  [API] → single async loop → 1M sequential UPDATEs
Target:   [API] → Queue → [Worker 1] [Worker 2] [Worker N] → batched UPDATEs (500/batch)
```

---

## 2. High Priority Problems

### 2.1 Stats Computed Live on Every Request

> Requirement: `GET /campaigns/:id/stats` → `open_rate`, `send_rate`, `total`, `sent`, `failed`, `opened`

Every stats request runs a full aggregation scan:

```sql
-- This runs on EVERY request, on EVERY status change
SELECT status, COUNT(*)
FROM campaign_recipients
WHERE campaign_id = $id
GROUP BY status;
```

At 1M recipients per campaign × many concurrent users viewing the dashboard → query timeout under load.

**Fix:** Denormalized counters on the `campaigns` table, incremented atomically by the send worker.

```sql
-- O(1) read instead of O(n) scan
UPDATE campaigns
SET sent_count = sent_count + 1
WHERE id = $campaignId;
```

---

### 2.2 `GET /recipients` Has No Pagination

> Requirement: `GET /recipients` — List all recipients

No `page`, `limit`, or cursor parameters defined. At 5M rows:

- Backend loads entire result set into memory → OOM crash
- Response payload becomes hundreds of MB
- Client browser / mobile app cannot render it

**Fix:** Mandatory cursor-based pagination.

```
GET /recipients?cursor=<last_id>&limit=50
```

Note: Offset-based pagination (`OFFSET 100000`) also degrades linearly past ~100K rows — cursor pagination is the correct solution at scale.

---

### 2.3 Recipient IDs Sent in Request Body

> Requirement: `POST /campaigns` accepts `"recipientIds": [1, 2, 3]`

The API accepts a raw array of recipient IDs in the JSON body. At 100K+ recipients:

- JSON payload grows to 4MB+ per request (100K UUIDs)
- App attempts a single `INSERT` for all `campaign_recipients` rows in one transaction
- No streaming, no chunking, no progress visibility
- HTTP request timeout before the transaction completes

**Fix:** Replace `recipientIds[]` in the request body with segment/tag-based targeting, or accept a file upload that is processed asynchronously in the background.

```
Current:  POST /campaigns  { recipientIds: [uuid x 100,000] }
Target:   POST /campaigns  { segmentId: "newsletter-subscribers" }
          → background job resolves segment → inserts in batches
```

---

## 3. Medium Priority Problems

### 3.1 No Rate Limiting or Auth Throttling

> Requirement: `POST /auth/register`, `POST /auth/login` — No auth required

No mention of rate limiting on auth endpoints. Consequences at scale:

- Credential stuffing / brute force on `/auth/login` with no protection
- `/auth/register` can be spammed to fill the `users` table
- JWT has no revocation — a stolen token is valid until expiry with no way to invalidate it

**Fix:**
- Rate limiting per IP (`express-rate-limit`)
- Account lockout after N failed attempts
- Short-lived JWT (15 min) + refresh token pattern with a revocation list

---

### 3.2 Offset-Based Pagination on Campaigns

> Requirement: `GET /campaigns` — `page` (default: 1), `limit` (default: 20)

Classic offset pagination degrades with dataset size:

```sql
-- PostgreSQL must scan and discard 10,000 rows before returning 20
SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
```

Performance degrades linearly — page 500 is 500× slower than page 1.

**Fix:** Cursor-based pagination.

```sql
SELECT * FROM campaigns
WHERE created_at < $cursor
ORDER BY created_at DESC
LIMIT 20;
```

---

### 3.3 No Unsubscribe Handling

Neither the schema nor the API have a mechanism to:

- Honor unsubscribe requests before a send begins
- Skip unsubscribed recipients during the send loop
- Record *which campaign* triggered an unsubscribe

At scale, sending to unsubscribed users leads to:
- CAN-SPAM / GDPR violations → legal exposure
- High complaint rates → domain blacklisting
- All future emails routed to spam

**Fix:** Check `recipients.unsubscribed_at IS NULL` in the send worker batch query. Never send to unsubscribed rows.

```sql
-- Send worker must include this join condition
JOIN recipients r ON r.id = cr.recipient_id
WHERE cr.status = 'pending'
  AND r.unsubscribed_at IS NULL  -- ← mandatory filter
```

---

## 4. Low Priority (Infrastructure)

### 4.1 Single PostgreSQL Instance — No Read Replicas or Connection Pooling

All reads (stats, campaign lists, recipient lookups) and all writes (send worker updates) hit the same database instance. Under concurrent sends:

- Send worker saturates write IOPS
- Dashboard and stats queries compete for the same connection pool
- No PgBouncer or equivalent connection pooler mentioned

**Fix (when traffic demands it):**
- PgBouncer in transaction-pooling mode to handle connection spikes
- A read replica for stats/reporting queries
- Tune `autovacuum_vacuum_scale_factor = 0.01` on `campaign_recipients` (high-churn table)

---

## 5. Priority Summary

| # | Problem | Impact | Urgency |
|---|---|---|---|
| 1 | Single-process send loop | Data loss on crash, cannot scale horizontally | **Critical** |
| 2 | Live stats aggregation | Query timeout at scale | **High** |
| 3 | Unpaginated `GET /recipients` | OOM / server crash | **High** |
| 4 | Recipient IDs in request body | 4MB+ payloads, single transaction timeout | **High** |
| 5 | No rate limiting on auth | Security + resource exhaustion | **Medium** |
| 6 | Offset pagination on campaigns | Slow at page 500+ | **Medium** |
| 7 | No unsubscribe flow | Legal / deliverability risk | **Medium** |
| 8 | No read replicas / connection pooling | DB saturation under sustained load | **Low (infra)** |

---

*Analysis version: 1.0 — last updated 2026-03-31*
