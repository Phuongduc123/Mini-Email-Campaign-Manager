# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini Campaign Manager — a full-stack email marketing system built as a Yarn monorepo with two packages: `packages/backend` (Express + TypeScript) and `packages/frontend` (React 18 + Vite).

## Commands

### Development

```bash
# Start backend (nodemon + ts-node, port 3000)
yarn backend

# Start frontend (Vite dev server, port 5173)
yarn frontend

# Start PostgreSQL (port 5433)
docker-compose up -d
```

### Backend

```bash
# Run database migrations
yarn workspace backend migrate

# Build
yarn workspace backend build

# Run production build
yarn workspace backend start

# Run tests
yarn workspace backend test

# Run a single test file
yarn workspace backend test -- --testPathPattern=campaign.service
```

### Frontend

```bash
# Type check only (no emit)
yarn workspace frontend typecheck

# Production build
yarn workspace frontend build
```

## Architecture

### Request Lifecycle (Backend)

```
HTTP Request
  → Rate Limiter
  → Request ID injection (x-request-id header)
  → JWT auth middleware
  → Zod schema validation middleware
  → Controller (thin, delegates to service)
  → Service (business logic)
  → Repository (Sequelize ORM queries)
  → Response
  → Global error handler
```

### Backend Layer Responsibilities

- **Routes** (`modules/*/**.routes.ts`): wire middleware + controller methods only
- **Controllers** (`modules/*/**.controller.ts`): extract req params, call service, send response
- **Services** (`modules/*/**.service.ts`): all business logic, status transitions, logging
- **Repositories** (`modules/*/**.repository.ts`): all DB queries — services never import Sequelize models directly
- **Schemas** (`modules/*/**.schema.ts`): Zod input schemas, consumed by the validate middleware

### Frontend Data Flow

- **`api/`**: pure async functions (no React), use Axios client from `api/client.ts`
- **`hooks/`**: React Query wrappers around api functions — one hook per operation
- **`store/auth.store.ts`**: Zustand store for auth state only (`user`, `token`, `login()`, `logout()`)
- **`pages/`**: route-level components, compose hooks + components
- **`components/`**: stateless/presentational UI only

### Database

PostgreSQL 15 (Docker). Key enum types: `campaign_status` (draft → scheduled → sending → sent), `delivery_status` (pending | sent | failed).

Migrations live in `packages/backend/src/database/migrations/` and are run via `src/database/migrate.ts`.

### Environment Variables

Backend — copy `packages/backend/.env.example`: `PORT`, `DB_HOST`, `DB_PORT` (5433), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`

Frontend — copy `packages/frontend/.env.example`: `VITE_API_URL` (default: `http://localhost:3000`)

### Ports

| Service    | Port |
|------------|------|
| Backend    | 3000 |
| Frontend   | 5173 |
| PostgreSQL | 5433 |

## Key Patterns

- **Error handling**: throw `AppError` from `shared/utils/errors.ts` — the global error middleware catches it and formats the response with `requestId`
- **Validation**: use `validate(schema)` middleware factory; never validate inside controllers/services
- **Path alias**: frontend uses `@/` mapped to `src/`
- **Auth**: JWT access token (15 min) + refresh token (7 days) flow; refresh tokens SHA-256 hashed and stored in `refresh_tokens` table; rotated on every use (single-use)
- **Send simulation**: `modules/campaigns/send.service.ts` randomly marks recipients sent/failed — placeholder for real email delivery
- **Worker**: `campaign.worker.ts` is a separate process (BullMQ); run with `yarn workspace backend worker`

## API Response Shapes

Use the helpers from `shared/utils/response.ts` — never write raw `res.json()` in controllers:

```typescript
sendSuccess(res, data)       // 200  { data }
sendCreated(res, data)       // 201  { data }
sendDeleted(res)             // 200  { data: null }
sendPaginated(res, result)   // 200  { data: [...], meta: { total, page, limit, totalPages } }
```

The `/send` endpoint is the only exception — uses `res.status(202).json({ data: null })` directly.

**Error response shape** (thrown via `AppError`, formatted by global handler):
```json
{ "error": "CAMPAIGN_NOT_DRAFT", "message": "...", "statusCode": 409, "requestId": "req_abc" }
```
`details` array only present on `422 VALIDATION_ERROR`. Success responses never include `error`, `message`, `status`, or `code` fields.

## Error Codes Reference

| Code | Status | Trigger |
|------|--------|---------|
| `VALIDATION_ERROR` | 422 | Zod schema rejected request body |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Resource belongs to another user |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource (e.g. email already registered) |
| `CAMPAIGN_NOT_DRAFT` | 409 | Edit/delete attempted on non-draft campaign |
| `CAMPAIGN_NOT_SENDABLE` | 409 | Send attempted on already-sent/sending campaign |
| `RECIPIENT_EMAIL_EXISTS` | 409 | Duplicate recipient email |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INTERNAL_ERROR` | 500 | Unhandled exception — stack logged, generic message returned |

## Campaign Status Transitions

```
draft → scheduled   (via POST /campaigns/:id/schedule)
draft → sending     (via POST /campaigns/:id/send)
scheduled → sending (via POST /campaigns/:id/send)
sending → sent      (worker completes all batches)
sending → draft     (worker exhausts all retries — permanent failure)
```

**Rules enforced in `campaign.service.ts` (not controller, not DB):**
- Only `draft` campaigns can be edited or deleted
- Only `draft` or `scheduled` campaigns can be sent
- `scheduledAt` must be a future timestamp
- Stats rates: `open_rate = opened / sent`, `send_rate = sent / total` (divide-by-zero returns 0)

## Database Indexes

All migrations live in `packages/backend/src/database/migrations/`. Current indexes:

| Index | Table | Purpose |
|-------|-------|---------|
| `UNIQUE (email)` | users | Login lookup, duplicate check |
| `idx_campaigns_created_by` | campaigns | List campaigns by owner |
| `idx_campaigns_status` | campaigns | Filter by status |
| `idx_campaigns_created_by_status` | campaigns | Combined owner + status filter (single scan) |
| `idx_campaigns_created_by_id` | campaigns | Pagination `ORDER BY id DESC` scoped to owner |
| `UNIQUE (email)` | recipients | Duplicate email check on create |
| `idx_recipients_active` *(partial)* | recipients | Worker JOIN `WHERE unsubscribed_at IS NULL` — active rows only |
| `idx_cr_campaign_status` | campaign_recipients | Worker batch loop + stats aggregation |
| `idx_cr_pending_work` *(partial)* | campaign_recipients | Worker `WHERE status = 'pending'` — excludes completed rows |
| `idx_cr_recipient_id` | campaign_recipients | Reverse FK lookup by recipient |
| `idx_cr_opened_at` *(partial)* | campaign_recipients | `countOpened()` — skips ~65% of never-opened rows |
| `UNIQUE (token_hash)` | refresh_tokens | Token lookup on every refresh |
| `idx_refresh_tokens_user_id` | refresh_tokens | Revoke all tokens on logout/delete |

When adding new queries that filter or sort on unlisted columns, check if a new index is needed.

## Logging Rules

**What to log:** IDs, counts, durations, event names, status codes.

**Never log:**
- JWT tokens or refresh tokens (plain-text logs = account takeover)
- `password` or `password_hash`
- Full email body content (PII)
- Raw recipient email lists (log `count` instead)
- Raw validation errors on auth fields (may echo a submitted password)

Log levels: `error` = unhandled/infra failure · `warn` = expected business failure · `info` = normal lifecycle · `debug` = high-frequency internals (disabled in production).

## Known Scalability Limitations

- `/recipients` has no server-side search — will degrade with large datasets
- Campaign stats use denormalized counters (`sent_count`, `failed_count` on `campaigns` table) — O(1) reads
- Cursor-based pagination is the documented upgrade path (repository layer change only)
- `campaign_recipients` will need `FILLFACTOR = 70` + autovacuum tuning at high row counts (see DATABASE.md §6.5)
