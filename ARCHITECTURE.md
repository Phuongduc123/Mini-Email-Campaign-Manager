# Architecture Design — Mini Campaign Manager

Designed to be simple, production-minded, and incrementally scalable. Avoids over-engineering while making the right structural choices upfront.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [API Design Principles & Response Standard](#4-api-design-principles)
5. [Async Sending Design](#5-async-sending-design)
6. [Authentication & Token Strategy](#6-authentication--token-strategy)
7. [Logging & Observability](#7-logging--observability)
8. [Scalability Considerations](#8-scalability-considerations)
9. [Trade-offs](#9-trade-offs)

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser                                │
│                     React 18 + TypeScript                       │
│        React Query (data fetching) + Zustand (local state)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / REST JSON
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express API Server                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐               │
│  │  Routes  │→ │  Middleware  │→ │  Services  │               │
│  │          │  │  auth, zod   │  │  business  │               │
│  └──────────┘  └──────────────┘  └─────┬──────┘               │
│                                         │                       │
│                                  ┌──────▼──────┐               │
│                                  │ Repositories│               │
│                                  │ (DB access) │               │
│                                  └──────┬──────┘               │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                           ┌──────────────▼──────────────┐
                           │        PostgreSQL            │
                           │  (Sequelize ORM + migrations)│
                           └─────────────────────────────┘
```

**Request lifecycle:**
```
HTTP Request
  → Rate Limiter (express-rate-limit)
  → Request ID injection (middleware)
  → JWT verification (auth middleware)
  → Schema validation (Zod)
  → Controller (thin, delegates to service)
  → Service (business logic + logging)
  → Repository (DB queries)
  → Response
```

---

## 2. Backend Architecture

### 2.1 Folder Structure

```
packages/backend/src/
│
├── app.ts                    # Express app setup, middleware registration
├── server.ts                 # HTTP server entry point
│
├── config/
│   ├── database.ts           # Sequelize connection config
│   ├── env.ts                # Validated env vars (zod schema for process.env)
│   └── logger.ts             # Logger instance (pino)
│
├── database/
│   ├── models/               # Sequelize model definitions
│   │   ├── User.ts
│   │   ├── Campaign.ts
│   │   ├── Recipient.ts
│   │   └── CampaignRecipient.ts
│   ├── migrations/           # Sequelize migration files
│   └── seeders/              # Demo/dev seed data
│
├── modules/                  # Feature-based organization
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.schema.ts    # Zod schemas for this module
│   │
│   ├── campaigns/
│   │   ├── campaigns.routes.ts
│   │   ├── campaigns.controller.ts
│   │   ├── campaigns.service.ts
│   │   ├── campaigns.repository.ts
│   │   ├── campaigns.schema.ts
│   │   └── send.service.ts   # Async send simulation
│   │
│   └── recipients/
│       ├── recipients.routes.ts
│       ├── recipients.controller.ts
│       ├── recipients.service.ts
│       ├── recipients.repository.ts
│       └── recipients.schema.ts
│
├── middleware/
│   ├── authenticate.ts       # JWT verification → attaches req.user
│   ├── validate.ts           # Zod validation factory middleware
│   ├── requestId.ts          # Injects x-request-id into req + res headers
│   ├── rateLimiter.ts        # express-rate-limit config
│   └── errorHandler.ts       # Global error handler (last middleware)
│
├── shared/
│   ├── errors/
│   │   ├── AppError.ts       # Base error class
│   │   └── errors.ts         # Named error constants
│   ├── types/
│   │   └── express.d.ts      # Augmented Request type (req.user, req.requestId)
│   └── utils/
│       └── pagination.ts     # Offset pagination helpers
│
└── tests/
    ├── integration/
    │   ├── campaigns.test.ts
    │   └── auth.test.ts
    └── unit/
        └── stats.test.ts
```

---

### 2.2 Layer Responsibilities

| Layer | File pattern | Responsibility | What it must NOT do |
|---|---|---|---|
| **Route** | `*.routes.ts` | Register HTTP verb + path + middleware chain | Business logic |
| **Controller** | `*.controller.ts` | Parse req, call service, serialize res | DB access, business rules |
| **Service** | `*.service.ts` | Business logic, orchestration, logging | Direct DB queries |
| **Repository** | `*.repository.ts` | All DB queries (Sequelize calls) | Business logic |
| **Schema** | `*.schema.ts` | Zod input validation shapes | Nothing else |
| **Middleware** | `middleware/` | Cross-cutting: auth, validation, logging | Feature logic |

**Why feature-based over layer-based?**

Layer-based (`routes/`, `services/`, `controllers/` at root) forces you to jump across the tree for every change. Feature-based keeps everything for `campaigns` together — easier to navigate, easier to delete a feature.

---

### 2.3 Business Logic Rules (enforced in Service layer)

```
campaign.service.ts owns:
  - Status transition guard: only draft can be edited/deleted
  - Schedule validation: scheduled_at must be a future timestamp
  - Send trigger: set status → 'sending', delegate to send.service.ts
  - Stats computation: open_rate, send_rate (divide-by-zero safe)

send.service.ts owns:
  - Async send simulation loop
  - Batch update of campaign_recipients status
  - Final status update to 'sent'
  - Skip unsubscribed recipients
```

---

### 2.4 Validation & Error Handling

**Validation — Zod at the boundary:**

```
Request Body → Zod schema parse → typed object OR throw ZodError
              ↑
  validate.ts middleware catches ZodError → 422 response
```

Validation happens once in middleware before the controller is called. Services receive already-typed, already-validated data.

**Error handling — AppError class + global handler:**

```typescript
// shared/errors/AppError.ts
class AppError extends Error {
  constructor(
    public code: string,        // "CAMPAIGN_NOT_DRAFT"
    public message: string,
    public statusCode: number
  ) {}
}

// Usage in service:
if (campaign.status !== 'draft') {
  throw new AppError('CAMPAIGN_NOT_DRAFT', 'Campaign cannot be edited after scheduling.', 409);
}
```

```
Any thrown error (AppError or unexpected)
  → bubbles up through controller
  → caught by errorHandler.ts (last middleware)
  → AppError     → structured JSON response
  → Unknown Error → log full stack trace, return generic 500
```

**Error response shape:**

```json
{
  "error": "CAMPAIGN_NOT_DRAFT",
  "message": "Campaign cannot be edited after it has been scheduled or sent.",
  "statusCode": 409,
  "requestId": "req_abc123"
}
```

---

### 2.5 Database Access Patterns

- All DB access goes through the **Repository layer only** — services never import Sequelize models directly
- Repositories return plain objects using `.get({ plain: true })` — keeps services decoupled from ORM internals
- Stats query uses index-covered `(campaign_id, status)` — see DATABASE.md §3
- Batch send updates use `UPDATE ... WHERE id IN (...)` — never N+1 individual updates

---

## 3. Frontend Architecture

### 3.1 Folder Structure

```
packages/frontend/src/
│
├── main.tsx                  # App entry point
├── App.tsx                   # Router setup, auth guard
│
├── api/                      # Pure API call functions (no React)
│   ├── client.ts             # Axios instance, baseURL, auth header injection
│   ├── auth.api.ts
│   ├── campaigns.api.ts
│   └── recipients.api.ts
│
├── hooks/                    # React Query hooks — data fetching + mutations
│   ├── useCampaigns.ts       # useQuery: list campaigns
│   ├── useCampaign.ts        # useQuery: single campaign
│   ├── useCampaignStats.ts   # useQuery: stats (auto-refetch while sending)
│   ├── useCreateCampaign.ts  # useMutation
│   ├── useSendCampaign.ts    # useMutation
│   └── useRecipients.ts      # useQuery: recipient list
│
├── store/                    # Zustand — LOCAL UI state only
│   └── auth.store.ts         # { user, token, login(), logout() }
│
├── pages/                    # Route-level components (one per route)
│   ├── Login/
│   │   └── LoginPage.tsx
│   ├── Campaigns/
│   │   └── CampaignsPage.tsx
│   ├── NewCampaign/
│   │   └── NewCampaignPage.tsx
│   └── CampaignDetail/
│       └── CampaignDetailPage.tsx
│
├── components/               # Reusable, stateless UI components
│   ├── StatusBadge.tsx       # Color-coded campaign status
│   ├── StatsBar.tsx          # Progress bar for open_rate / send_rate
│   ├── RecipientTable.tsx    # Recipient list with status columns
│   ├── CampaignForm.tsx      # Shared form for create
│   ├── ErrorMessage.tsx      # Inline API error display
│   └── LoadingSkeleton.tsx   # Skeleton placeholders
│
└── types/                    # Shared TypeScript types
    ├── campaign.ts
    ├── recipient.ts
    └── api.ts                # ApiResponse<T>, ApiError shapes
```

---

### 3.2 Separation of Concerns

```
pages/         ← "what this route does" — composes hooks + components
hooks/         ← "how to get/mutate data" — React Query wrappers
api/           ← "how to talk to the backend" — pure async functions
store/         ← "persistent UI state not owned by a query" — auth only
components/    ← "how to render a concept" — receives props, no data fetching
```

**Rule:** Components never call `api/` directly. They receive data as props or call callbacks. Only hooks import from `api/`.

---

### 3.3 State Management Strategy

| State type | Where it lives | Why |
|---|---|---|
| Server data (campaigns, recipients, stats) | **React Query** | Caching, background refetch, stale-while-revalidate built in |
| Auth (user, token) | **Zustand** | Persists across navigations, not tied to a specific query |
| Form state | **React Hook Form** (local) | Local to form component lifetime |
| Loading / error per request | **React Query** | `isLoading`, `isError`, `error` — no extra code needed |
| UI state (modal open, tab selection) | **useState** (local) | No need to hoist ephemeral state |

**Zustand is used minimally** — only for auth. Everything else is React Query or local state. This avoids the "Zustand for everything" anti-pattern that re-creates the stale-data problem React Query already solves.

---

### 3.4 Loading & Error States

```
Every page/component that fetches data follows this pattern:

  if (isLoading) → <LoadingSkeleton />
  if (isError)   → <ErrorMessage error={error} />
  else           → render data
```

- Stats on `/campaigns/:id` use **polling** (`refetchInterval: 2000`) while `campaign.status === 'sending'`, then polling stops automatically
- Mutations (send, schedule, delete) show inline feedback via toast or status text
- 401 responses in `client.ts` Axios interceptor → clear Zustand auth → redirect to `/login`

---

## 4. API Design Principles

### 4.1 Endpoint Structure

- Resources are plural nouns: `/campaigns`, `/recipients`
- Non-CRUD actions use sub-resource paths: `/campaigns/:id/send`, `/campaigns/:id/schedule`
- No verbs in base resource paths

### 4.2 HTTP Status Codes

| Scenario | Code |
|---|---|
| Successful read | 200 |
| Resource created | 201 |
| Async task accepted | 202 |
| Validation error (Zod) | 422 |
| Business rule violation (edit non-draft) | 409 |
| Unauthenticated | 401 |
| Resource not found | 404 |
| Unhandled server error | 500 |

### 4.3 Pagination

```
GET /campaigns?page=1&limit=20&status=sent

Response:
{
  "data": [...],
  "meta": {
    "total": 134,
    "page": 1,
    "limit": 20,
    "totalPages": 7
  }
}
```

> Offset pagination is used now for simplicity. Cursor-based pagination is the documented upgrade path in SCALABLE.md.

### 4.4 Standardized API Response Format

All endpoints use one of four shapes — chosen by the controller helper. No other shapes are valid.

#### Single resource (200 / 201)

```json
{ "data": { "id": 1, "name": "Spring Launch", "status": "draft" } }
```

#### Paginated list (200)

```json
{
  "data": [ { "id": 1, ... }, { "id": 2, ... } ],
  "meta": {
    "total": 134,
    "page": 1,
    "limit": 20,
    "totalPages": 7
  }
}
```

#### Deleted / accepted (200 / 202)

```json
{ "data": null }
```

#### Error (4xx / 5xx)

```json
{
  "error": "CAMPAIGN_NOT_DRAFT",
  "message": "Campaign cannot be edited after it has been scheduled or sent.",
  "statusCode": 409,
  "requestId": "req_f4a2b1c9",
  "details": [{ "field": "scheduled_at", "message": "Must be a future date" }]
}
```

`details` is present **only** on `422 VALIDATION_ERROR` responses. All other errors omit it.

---

#### Controller helpers (`shared/utils/response.ts`)

```typescript
sendSuccess(res, data)          // 200  { data }
sendCreated(res, data)          // 201  { data }
sendDeleted(res)                // 200  { data: null }
sendPaginated(res, result)      // 200  { data, meta }
```

The `send` endpoint uses `res.status(202).json({ data: null })` directly — the only raw `res` call allowed.

---

#### Error codes reference

| Code | Status | Trigger |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Zod schema rejected the request body |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `NOT_FOUND` | 404 | Resource does not exist or belongs to another user |
| `CONFLICT` | 409 | Duplicate resource (e.g., email already registered) |
| `CAMPAIGN_NOT_DRAFT` | 409 | Edit/delete attempted on non-draft campaign |
| `CAMPAIGN_NOT_SENDABLE` | 409 | Send attempted on already-sent campaign |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INTERNAL_ERROR` | 500 | Unhandled exception — full stack logged, generic message returned |

---

#### Rules

- Success responses **never** include `success`, `message`, `status`, or `code` fields
- Error responses **never** include `data`
- The `requestId` field is always present in errors — correlates to server logs
- Unexpected errors always return the same generic message: `"An unexpected error occurred."` — the real error is logged server-side only

---

## 5. Async Sending Design

### 5.1 Current Implementation (Simple, Sufficient for This Challenge)

```
POST /campaigns/:id/send
  │
  ├─ [sync]  Validate campaign is sendable (status: draft | scheduled)
  ├─ [sync]  Set campaign.status = 'sending'
  ├─ [sync]  Return 202 Accepted immediately  ← client does not wait
  │
  └─ [async, detached]  send.service.ts
        ├─ Fetch pending CampaignRecipients in batches of 200
        ├─ For each batch:
        │   ├─ Simulate send: random sent/failed (80/20 split)
        │   ├─ Batch UPDATE campaign_recipients SET status, sent_at
        │   └─ Increment campaign.sent_count / failed_count atomically
        └─ When all batches done: SET campaign.status = 'sent'
```

**Why 202 Accepted?**
The send is async — returning 200 would imply the work is done. The client polls `GET /campaigns/:id/stats` to observe progress.

**Why fire-and-forget instead of awaiting?**
Holding the HTTP connection open for a 10,000-recipient send would time out the request. Detached async + polling is the correct pattern here.

### 5.2 Partial Failure Handling

```
Individual recipient failure:
  → status = 'failed', error_message recorded
  → does NOT stop the batch loop
  → campaign.failed_count incremented atomically

Process crash mid-send:
  → campaign.status remains 'sending'
  → Recovery: find campaigns stuck in 'sending' for > N minutes → re-trigger from last pending row

Final result: campaign ends with a mix of sent + failed rows.
Final status is always 'sent' — meaning "processing complete", not "all succeeded".
```

### 5.3 Future Upgrade Path

```
Current:   Detached async loop in same Node.js process
↓
Phase 2:   BullMQ job queue + separate worker process
           POST /send → enqueue job → return 202
           Worker crash → BullMQ auto-retries from checkpoint
↓
Phase 3:   Multiple worker replicas, sharded by campaign_id
```

`send.service.ts` is a pure function — wrapping it inside a BullMQ worker requires zero refactoring of the service itself.

---

## 6. Authentication & Token Strategy

### 6.1 Token Types

| Token | Format | Lifetime | Storage |
|---|---|---|---|
| **Access token** | Signed JWT (HS256) | 15 minutes | Memory / `Authorization: Bearer` header |
| **Refresh token** | Random UUID (v4) | 7 days | Secure httpOnly cookie or client-side store |

Access tokens are short-lived to limit the blast radius of a leak. Refresh tokens cover the full session and are only exchanged on the dedicated `/auth/refresh` endpoint.

### 6.2 Token Flow

```
┌─────────┐         ┌────────────────┐        ┌──────────────┐
│  Client │         │  Auth Service  │        │  PostgreSQL  │
└────┬────┘         └───────┬────────┘        └──────┬───────┘
     │                      │                        │
     │  POST /auth/register  │                        │
     │  POST /auth/login     │                        │
     │──────────────────────►│                        │
     │                       │  INSERT refresh_tokens │
     │                       │───────────────────────►│
     │                       │                        │
     │◄──────────────────────│                        │
     │  { accessToken,       │                        │
     │    refreshToken,      │                        │
     │    user }             │                        │
     │                       │                        │
     │  (15 min passes...)   │                        │
     │                       │                        │
     │  POST /auth/refresh   │                        │
     │  { refreshToken }     │                        │
     │──────────────────────►│                        │
     │                       │  SELECT + validate     │
     │                       │───────────────────────►│
     │                       │  UPDATE revokedAt      │  ← old token revoked
     │                       │───────────────────────►│
     │                       │  INSERT new token      │  ← new token issued
     │                       │───────────────────────►│
     │◄──────────────────────│                        │
     │  { accessToken,       │                        │
     │    refreshToken }     │                        │
     │                       │                        │
     │  POST /auth/logout    │                        │
     │  { refreshToken }     │                        │
     │──────────────────────►│                        │
     │                       │  UPDATE revokedAt      │
     │                       │───────────────────────►│
     │◄──────────────────────│                        │
     │  200 OK               │                        │
```

### 6.3 Token Rotation (Single-Use Refresh Tokens)

Every call to `POST /auth/refresh` performs **token rotation**:

```
1. Look up stored token by hash
2. Validate: not expired, not revoked
3. Revoke old token  (revokedAt = NOW)      ← single-use enforced
4. Issue brand-new refresh token
5. Return new access token + new refresh token
```

**Why rotation?** If a refresh token is stolen and used by an attacker, the legitimate user's next refresh will fail (their token has already been rotated). This creates a detectable signal: two parties racing on the same token — the losing party gets a 401, and the session can be terminated.

### 6.4 Database Design (`refresh_tokens` table)

```
refresh_tokens
──────────────────────────────────────────
id           SERIAL PRIMARY KEY
user_id      INTEGER  FK → users(id)  ON DELETE CASCADE
token_hash   VARCHAR(64)  UNIQUE       ← SHA-256 of raw token
expires_at   TIMESTAMPTZ NOT NULL
revoked_at   TIMESTAMPTZ DEFAULT NULL
created_at   TIMESTAMPTZ DEFAULT NOW()
```

**Indexes:**
- `UNIQUE (token_hash)` — fast lookup by hash
- `(user_id)` — fast `revokeAllUserRefreshTokens(userId)` on password change / account delete

**Raw token never stored.** Only the SHA-256 hex digest is persisted:

```typescript
// auth.repository.ts
const hash = createHash('sha256').update(rawToken).digest('hex');
await RefreshToken.create({ userId, tokenHash: hash, expiresAt });
```

This means a database breach does not expose usable tokens.

### 6.5 Auth Endpoints Summary

| Method | Path | Auth required | Rate limited | Description |
|---|---|---|---|---|
| `POST` | `/auth/register` | No | Yes (10 req/15 min) | Create account → return token pair |
| `POST` | `/auth/login` | No | Yes (10 req/15 min) | Verify credentials → return token pair |
| `POST` | `/auth/refresh` | No | Yes (10 req/15 min) | Rotate refresh token → return new pair |
| `POST` | `/auth/logout` | No | No | Revoke refresh token |

### 6.6 Security Design Decisions

| Decision | Rationale |
|---|---|
| 15-minute access token TTL | Short window limits impact of a leaked JWT — no revocation needed |
| Refresh token as random UUID | Opaque, unguessable — no information embedded unlike JWT |
| SHA-256 hash in DB | DB breach doesn't yield usable tokens |
| Token rotation on every refresh | Detect token theft: simultaneous use → 401 on second use |
| `ON DELETE CASCADE` on `user_id` | Deleting a user removes all their tokens atomically |
| Rate limiting on all auth routes | Blocks brute-force and token enumeration attempts |
| Logout revokes by token (not user) | Supports multiple device sessions; logout one session only |

### 6.7 Middleware Flow for Protected Routes

```
Request to protected endpoint
  │
  ├─ authenticate.middleware.ts
  │   ├─ Extract Bearer token from Authorization header
  │   ├─ jwt.verify(token, secret)
  │   │   ├─ Invalid signature → 401 UNAUTHORIZED
  │   │   └─ Expired → 401 UNAUTHORIZED
  │   └─ Attach { id, email } to req.user
  │
  └─ Controller (req.user is guaranteed non-null here)
```

Access tokens are **stateless** — no DB lookup on every request. Revocation is handled by short TTL + refresh token rotation.

---

## 7. Logging & Observability


### 7.1 Logger Setup

Use **pino** configured in `config/logger.ts`:

```
Development:  pino-pretty  (human-readable, colorized)
Production:   JSON lines   (structured, machine-parseable, ships to Loki/Datadog)
```

### 7.2 Request ID (Correlation ID)

Every request gets a unique ID from `requestId.ts` middleware:

```
Request arrives
  → req.requestId = uuid()  (or read x-request-id from upstream proxy)
  → res.setHeader('x-request-id', req.requestId)
  → All log lines for this request include requestId
```

This allows tracing a complete request flow across all log lines — from route through service through repository.

### 7.3 What Gets Logged (and Where)

| Event | Level | Layer | Fields |
|---|---|---|---|
| Request received | `info` | middleware | method, path, requestId, userId |
| Request completed | `info` | middleware | statusCode, durationMs, requestId |
| Login success | `info` | auth.service | userId, requestId |
| Login failure | `warn` | auth.service | reason, requestId (NOT the email) |
| Campaign created | `info` | campaigns.service | campaignId, userId, requestId |
| Campaign status change | `info` | campaigns.service | campaignId, oldStatus, newStatus |
| Send started | `info` | send.service | campaignId, totalRecipients |
| Batch processed | `debug` | send.service | campaignId, batchSize, sentCount, failedCount |
| Send completed | `info` | send.service | campaignId, totalSent, totalFailed, durationMs |
| Recipient failed | `warn` | send.service | campaignId, recipientId, errorMessage |
| Validation error | `warn` | middleware | path, fields, requestId |
| Unexpected error | `error` | errorHandler | stack, requestId, userId |
| Slow DB query >500ms | `warn` | repository | sanitized query, durationMs |

### 7.4 Log Format

```json
{
  "level": "info",
  "time": "2026-04-02T10:23:45.123Z",
  "requestId": "req_f4a2b1c9",
  "userId": "usr_abc123",
  "campaignId": "cmp_xyz789",
  "event": "campaign.send.completed",
  "totalSent": 980,
  "totalFailed": 20,
  "durationMs": 4321,
  "msg": "Campaign send completed"
}
```

### 7.5 What Must NOT Be Logged

| Data | Why |
|---|---|
| JWT tokens | Logs stored in plain text — leaked JWT = account takeover |
| `password` / `password_hash` | Never log credentials |
| Full email body content | PII + excessive volume |
| Raw validation errors on auth fields | May echo back a submitted password |
| Full recipient email lists | High PII density — log `count` instead |

**Rule:** Log IDs and counts. Never log raw values that could be PII.

### 7.6 Log Levels

| Level | Use for |
|---|---|
| `error` | Unhandled exceptions, DB connection failure — requires immediate action |
| `warn` | Expected business failures: login failed, delivery failed, validation rejected |
| `info` | Normal lifecycle: request in/out, campaign created, send started/completed |
| `debug` | High-frequency internals: batch progress, query timing. **Disabled in production** |

### 7.7 Basic Metrics (via log aggregation — no code changes needed)

| Metric | Source |
|---|---|
| Campaigns sent per day | Count `event: campaign.send.completed` |
| Send failure rate | `totalFailed / totalRecipients` on send complete |
| Average send duration | `durationMs` on send complete |
| API error rate | Count 5xx in access logs |
| Auth failure rate | Count `event: auth.login.failed` |

---

## 8. Scalability Considerations

See [SCALABLE.md](SCALABLE.md) for full bottleneck analysis. Architecture-level responses:

### 8.1 Write Amplification During Send

**Solution built in:**
- `send.service.ts` uses batched UPDATEs (200 rows/batch)
- Repository exposes `batchUpdateStatus(ids[], status)` — never loops individual updates

**Upgrade:** Wrap `send.service.ts` in a BullMQ worker, add horizontal worker replicas. Zero service refactoring needed.

### 8.2 Stats Aggregation Cost

**Solution built in:**
- Denormalized `sent_count`, `failed_count`, `opened_count` on `campaigns` table
- Incremented atomically during send: `UPDATE campaigns SET sent_count = sent_count + 1`
- `GET /campaigns/:id/stats` = single row read, O(1)

### 8.3 Partitioning vs Sharding

**Table Partitioning — YES, applicable when needed:**
- Range-partition `campaign_recipients` by `created_at` at ~50M rows
- Native PostgreSQL — no application code changes required
- Old partitions archived/dropped without full-table lock

**Sharding — NOT applicable here:**
- Sharding is for when a single instance cannot handle the load at all
- Adds enormous operational complexity: cross-shard queries lose easy JOINs, distributed transactions, routing logic in app
- Correct scale-up order: **Partitioning → Read Replica → PgBouncer → only then consider sharding**
- A campaign manager would need hundreds of millions of rows + thousands of concurrent QPS before sharding is warranted

### 8.4 Connection Pooling

- **Now:** Sequelize built-in pool (`max: 10`)
- **At scale:** PgBouncer in transaction mode in front of PostgreSQL — update connection string only, no code changes

---

## 9. Trade-offs

### 9.1 Intentional Simplifications

| Decision | Simplified | Why acceptable |
|---|---|---|
| Async send | Detached Promise instead of BullMQ | Queue infra adds 30min setup; architecture is queue-ready by design |
| Stats | Denormalized counters, not real-time | Near-real-time is fine; counters incremented atomically |
| Pagination | Offset-based | Simple; cursor upgrade documented and isolated to repository layer |
| Recipient input | Array of IDs in body | Simplifies MVP; segment-based targeting is the upgrade path |
| Auth | JWT (15 min) + UUID refresh tokens (7 days, SHA-256 hashed, rotated on each use) | Stateless access, short TTL, DB-backed revocation via refresh token |
| Observability | Structured logging only | No Prometheus/Grafana needed at this scale |

### 9.2 What Was NOT Simplified

| Concern | Choice |
|---|---|
| Error handling | Global handler, typed `AppError`, stack traces never reach client |
| Validation | Zod at every boundary; services receive typed, validated data |
| SQL safety | Repository layer with parameterized queries only |
| Status transitions | Enforced in service layer, not just UI |
| Logging | Structured JSON, correlation ID, PII exclusion |
| DB schema | Proper indexes, partial indexes, FK constraints, CHECK constraints |

### 9.3 Upgrade Path Summary

```
Simple now                        Scale-ready later
────────────────────────────────  ────────────────────────────────
Detached async loop            →  BullMQ worker (send.service unchanged)
Offset pagination              →  Cursor pagination (repository layer only)
recipientIds[] in body         →  Segment-based targeting
Single DB instance             →  Read replica + PgBouncer
Log to stdout                  →  Loki / Datadog ingestion
No partitioning                →  Range-partition campaign_recipients at 50M rows
```

Each upgrade is independent — none requires modifying the others.

---

*Architecture version: 1.1 — last updated 2026-04-03*
