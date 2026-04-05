# Mailer — Email Campaign Manager

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-5-FF6B6B)
![License](https://img.shields.io/badge/license-MIT-green)

A full-stack email campaign management system built as a Yarn monorepo. Create, schedule, and send email campaigns to recipient lists — with async job processing, open-rate tracking via pixel, and a clean SaaS-style UI.

---

## Description

### What it does

Mailer lets marketing teams manage the full lifecycle of email campaigns:

- **Draft** a campaign with a name, subject line, and HTML body
- **Assign recipients** from a managed contact list
- **Schedule** delivery at a future date/time or **send immediately**
- **Track delivery** (sent / failed counts) and **open rates** via a 1×1 tracking pixel embedded in each email
- **Search and paginate** through campaigns and recipients

### The problem it solves

Most open-source email senders are either simple scripts or heavyweight platforms. Mailer sits in the middle: it demonstrates a production-grade architecture — async job queues, JWT refresh-token rotation, Redis-backed rate limiting, denormalized counters — while remaining easy to run locally with Docker.

---

## Features

- **JWT Auth** — access token (short-lived) + refresh token rotation, tokens stored in `refresh_tokens` table
- **Campaign lifecycle** — `draft → scheduled → sending → sent` state machine with guard rails
- **Async send worker** — BullMQ + Redis; the API enqueues a job and returns immediately; the worker process does the heavy lifting
- **Scheduled campaigns** — BullMQ delayed jobs fire at the exact `scheduledAt` timestamp (no cron polling)
- **Open-rate tracking** — `GET /track/open?c=:campaignId&r=:recipientId` returns a transparent 1×1 GIF and records `openedAt` (idempotent, no auth required)
- **Campaign stats** — live `total / sent / failed / opened / open_rate / send_rate`
- **Recipient management** — add contacts, paginated list, duplicate-email guard
- **Search** — server-side `ILIKE` search on campaign name and subject
- **Redis rate limiter** — fixed-window, per-IP, distributed-safe (no in-memory state)
- **Request IDs** — every request gets a `x-request-id` header, threaded through error responses and logs
- **Zod validation** — all inputs validated at the route layer via `validate(schema)` middleware
- **Structured logging** — pino-based JSON logs with event types and durations
- **Seed script** — generates 300 recipients + 2 000 campaigns with realistic statuses and open data
- **Swagger UI** — auto-generated API docs at `/api/docs`
- **98 tests** — Jest (backend) + Vitest + Testing Library (frontend)

---

## Tech Stack

### Backend (`packages/backend`)

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework | Express 4 |
| ORM | Sequelize 6 + `pg` |
| Queue | BullMQ 5 (Redis) |
| Auth | `jsonwebtoken` + `bcryptjs` |
| Validation | Zod |
| Logging | Pino |
| API Docs | swagger-ui-express |
| Testing | Jest 29 + ts-jest |

### Frontend (`packages/frontend`)

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript 5 |
| Build | Vite 5 |
| Routing | React Router v6 |
| Data fetching | TanStack Query v5 |
| State | Zustand 4 (persisted) |
| Forms | react-hook-form 7 |
| HTTP | Axios (with interceptor for token refresh) |
| Styling | Tailwind CSS 3 |
| Testing | Vitest 2 + Testing Library |

### Infrastructure

| Service | Image | Port |
|---|---|---|
| PostgreSQL | `postgres:15-alpine` | 5433 |
| Redis | `redis:7-alpine` | 6380 |

---

## Project Structure

```
email-marketing-system/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── config/           # env, database, redis, logger, swagger
│   │       ├── database/
│   │       │   ├── migrations/   # Sequelize table definitions
│   │       │   ├── models/       # Sequelize model classes
│   │       │   ├── migrate.ts    # sync runner
│   │       │   └── seed.ts       # 300 recipients + 2 000 campaigns
│   │       ├── middleware/       # auth, validate, rateLimiter, requestId, error
│   │       ├── modules/
│   │       │   ├── auth/         # register, login, refresh, logout
│   │       │   ├── campaigns/    # CRUD, schedule, send, stats
│   │       │   ├── recipients/   # CRUD + list
│   │       │   └── tracking/     # GET /track/open (pixel endpoint)
│   │       ├── queue/            # BullMQ queue singleton
│   │       ├── routes/           # top-level router
│   │       ├── shared/           # types, AppError hierarchy, response helpers
│   │       ├── workers/
│   │       │   └── campaign.worker.ts   # standalone worker process
│   │       ├── app.ts
│   │       └── server.ts
│   │
│   └── frontend/
│       └── src/
│           ├── api/              # pure async API functions (no React)
│           ├── components/       # AppLayout, StatusBadge, Skeletons, ErrorBoundary…
│           ├── hooks/            # React Query wrappers (one per operation)
│           ├── lib/              # queryClient singleton
│           ├── pages/            # Login, Register, Campaigns, CampaignDetail, Recipients, NewCampaign
│           ├── store/            # auth.store (Zustand + persist)
│           └── types/            # shared TypeScript interfaces
│
├── docker-compose.yml
└── package.json                  # Yarn workspace root
```

### Request lifecycle (backend)

```
HTTP Request
  → Redis Rate Limiter
  → Request ID injection
  → JWT auth middleware
  → Zod validation middleware
  → Controller  (thin — extracts params, calls service, sends response)
  → Service      (business logic, state transitions)
  → Repository   (all Sequelize queries — services never import models directly)
  → Global error handler  (formats AppError → { error, message, statusCode, requestId })
```

---

## Installation

### Prerequisites

- Node.js ≥ 20
- Yarn 1.x (`npm install -g yarn`)
- Docker & Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/your-username/email-marketing-system.git
cd email-marketing-system
yarn install
```

### 2. Start infrastructure

```bash
docker-compose up -d
# Starts PostgreSQL on :5433 and Redis on :6380
```

### 3. Configure environment

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Edit `packages/backend/.env` — at minimum set a real `JWT_SECRET`.

### 4. Run migrations

```bash
yarn workspace backend migrate
```

### 5. (Optional) Seed demo data

```bash
yarn workspace backend seed
# Creates demo@example.com / password123 + 300 recipients + 2 000 campaigns
```

---

## Usage

You need **three terminal tabs** for the full stack in development:

```bash
# Tab 1 — API server (port 3000)
yarn backend

# Tab 2 — Background worker (consumes the BullMQ queue)
yarn workspace backend worker

# Tab 3 — Frontend dev server (port 5173)
yarn frontend
```

Open [http://localhost:5173](http://localhost:5173).  
If you ran the seed, log in with `demo@example.com` / `password123`.

> **Why a separate worker?**  
> When you click "Send", the API immediately flips the campaign to `sending` and drops a job into Redis. The worker picks it up and processes recipients in batches of 200. Without the worker running, campaigns stay in `sending` indefinitely.

---

## API Documentation

Interactive Swagger UI is available at:

```
http://localhost:3000/api/docs
```

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication

All endpoints except `/auth/*` and `GET /track/open` require:

```
Authorization: Bearer <accessToken>
```

Access tokens expire per `JWT_EXPIRES_IN`. The frontend automatically refreshes them using the stored `refreshToken`. On refresh failure, the user is redirected to `/login` and the React Query cache is cleared.

### Endpoints summary

#### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account → returns `accessToken` + `refreshToken` |
| `POST` | `/auth/login` | Login → returns `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `POST` | `/auth/logout` | Revoke refresh token |

#### Campaigns

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/campaigns` | List campaigns — `?page=1&limit=20&status=draft&search=flash` |
| `POST` | `/campaigns` | Create campaign |
| `GET` | `/campaigns/:id` | Get campaign with recipients |
| `PATCH` | `/campaigns/:id` | Update (draft only) |
| `DELETE` | `/campaigns/:id` | Delete (draft only) |
| `POST` | `/campaigns/:id/schedule` | Schedule → `{ scheduledAt: ISO8601 }` |
| `POST` | `/campaigns/:id/send` | Send immediately (202 Accepted) |
| `GET` | `/campaigns/:id/stats` | Live stats: `total / sent / failed / opened / open_rate` |

#### Recipients

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/recipients` | List recipients — `?page=1&limit=20` |
| `POST` | `/recipient` | Create recipient |

#### Tracking

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/track/open` | Pixel endpoint — `?c=campaignId&r=recipientId` — no auth |

### Response shapes

```jsonc
// Success (single)
{ "data": { ... } }

// Success (paginated)
{ "data": [...], "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 } }

// Error
{ "error": "NOT_FOUND", "message": "Campaign not found.", "statusCode": 404, "requestId": "abc123" }
```

---

## Configuration

### `packages/backend/.env`

```env
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL (matches docker-compose)
DB_HOST=localhost
DB_PORT=5433
DB_NAME=campaign_manager
DB_USER=postgres
DB_PASSWORD=postgres

# JWT
JWT_SECRET=change-me-in-production          # must be long and random
JWT_EXPIRES_IN=15m                           # access token TTL
JWT_REFRESH_EXPIRES_IN=7d                    # refresh token TTL

# Redis (matches docker-compose)
REDIS_HOST=localhost
REDIS_PORT=6380

# Worker
WORKER_CONCURRENCY=5                         # parallel jobs per worker process

# Open-rate tracking (optional — defaults to http://localhost:PORT)
BASE_URL=http://localhost:3000
```

### `packages/frontend/.env`

```env
VITE_API_URL=http://localhost:3000/api/v1
```

---

## Testing

### Backend (Jest)

```bash
# Run all tests
yarn workspace backend test

# Run a single file
yarn workspace backend test -- --testPathPattern=auth.service

# Coverage report (text + HTML in packages/backend/coverage/)
yarn workspace backend test:coverage
```

Test files live in `packages/backend/src/tests/` and cover:

- `auth.service` — register conflict, password hashing, login, refresh rotation, logout
- `campaign.service.send` — status guards, BullMQ job enqueue, idempotent job IDs
- `validate.middleware` — Zod coercion, extra-field stripping, 422 responses
- `auth.middleware` — missing/malformed/expired/wrong-secret tokens

### Frontend (Vitest + Testing Library)

```bash
# Run all tests
yarn workspace frontend test

# Watch mode
yarn workspace frontend test:watch

# Coverage report (text + HTML in packages/frontend/coverage/)
yarn workspace frontend test:coverage
```

Test files live in `packages/frontend/src/tests/` and cover:

- `ErrorBoundary` — renders fallback, recovery on retry
- `StatusBadge` — correct label and colour per status
- `useSendCampaign` — mutation wiring and query invalidation
- `auth.store` — setAuth, setTokens, logout, persistence

---

## Deployment

The project ships with a `docker-compose.yml` that includes a `worker` service for production use. To run the full stack with Docker:

### 1. Add a backend `Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN yarn install --frozen-lockfile
RUN yarn workspace backend build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules
CMD ["node", "dist/server.js"]
```

### 2. Start all services

```bash
docker-compose up --build
```

This starts PostgreSQL, Redis, the API server, and the worker — all with health checks and `restart: unless-stopped`.

### Production checklist

- Set a strong random `JWT_SECRET` (≥ 64 chars)
- Set `NODE_ENV=production`
- Point `BASE_URL` to your public domain (used for tracking pixel URLs)
- Run `yarn workspace backend migrate` before first boot
- Use a managed Redis (Upstash, Redis Cloud) if you need persistence guarantees

---

## Contributing

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make changes — run `yarn workspace backend build` and `yarn workspace frontend typecheck` before committing
3. Add or update tests as appropriate
4. Open a pull request with a clear description of the change

---

## License

MIT

---

## How I Used Claude Code

I used [Claude Code](https://claude.ai/code) extensively throughout this project — not as a replacement for engineering judgment, but as a fast pair-programmer for the repetitive and structural parts of the codebase.

### Tasks I delegated

- **Code scaffolding** — boilerplate for models, migrations, and the Controller → Service → Repository structure across all modules, so I could focus on business logic from day one

- **Performance analysis & refactoring** — I directed Claude to audit the codebase for scalability bottlenecks, produce a prioritized problem list (`SCALABLE.md`), then implement the fixes I approved: migrating from a synchronous in-process send loop to an async BullMQ worker, replacing cron-polling with BullMQ delayed jobs, and adding a Redis-backed distributed rate limiter

- **Technical documentation** — first drafts of `ARCHITECTURE.md`, `DATABASE.md`, `SCALABLE.md`, `SOLUTION.md`, and `CLAUDE.md`. I provided the constraints and context; Claude structured and wrote the content; I reviewed and revised

- **Test generation** — Jest (backend) and Vitest + Testing Library (frontend) suites. I specified which behaviours to cover and corrected the output where needed

- **UI redesign** — modernising the interface with a consistent Tailwind design system (slate/indigo palette, shared layout components, unified spacing)

- **Feature implementation** — open-rate tracking pixel, server-side campaign search, debounced search UI with URL-synced state, and a seed script for realistic demo data

- **Bug diagnosis** — tracing the stale cache issue after account switching and the pagination contract mismatch between the backend repository and the frontend

- **Claude Code hooks for guardrails** — I configured `PreToolUse` hooks in `.claude/settings.json` to automatically block Claude from directly editing security-sensitive files (`auth.middleware.ts`, `auth.service.ts`, `rateLimiter.middleware.ts`), infrastructure config files (`docker-compose.yml`, `.env*`), and migration files — and from running any Bash command containing destructive SQL (`DELETE FROM`, `DROP TABLE`, `TRUNCATE`). All four categories are hard-blocked with a message explaining they must be applied or run manually. This removes the need to remember to refuse these requests — the guardrails enforce it automatically on every session.

- **GitHub PR integration (experimental)** — I connected Claude Code to the GitHub repository to automatically review pull requests and post inline comments on diffs. In practice this worked well for catching obvious issues (missing error handling, inconsistent naming, off-spec API responses), but I kept it in a test/unpaid configuration rather than enabling it for every PR — the signal-to-noise ratio at this project scale did not justify the cost. The integration exists and can be enabled per-PR when a second opinion on a non-trivial change is worth it.

### Real prompts I used

**1. Full-stack boilerplate scaffolding**

```
You are a senior backend engineer. I am building a full-stack email campaign manager
as a Yarn monorepo (packages/backend, packages/frontend).

Backend stack: Express + TypeScript + Sequelize + PostgreSQL + Zod + JWT.
Architecture: Controller → Service → Repository pattern, feature-based folder structure
(modules/auth, modules/campaigns, modules/recipients).

Your task — use the Explore subagent to read the current folder structure and any
existing files first, then:

1. Generate Sequelize models for: User, Campaign, Recipient, CampaignRecipient, RefreshToken.
   - Include all columns, types, indexes, FK constraints, and field-level snake_case mapping.
   - Add a toJSON() override on each model to convert snake_case DB fields to camelCase
     in API responses.

2. Generate migration files (one per table) using Sequelize QueryInterface — NOT sync().
   - Tables must be created in dependency order (users first, campaigns after, etc.)

3. Generate the full module skeleton for campaigns and recipients:
   - *.routes.ts    — registers middleware + controller methods only
   - *.controller.ts — thin: extract params, call service, call sendSuccess/sendPaginated
   - *.service.ts   — stub with method signatures and JSDoc; no implementation yet
   - *.repository.ts — stub with method signatures; services must never import models directly
   - *.schema.ts    — Zod schemas for all request inputs

4. Generate shared utilities:
   - shared/utils/errors.ts — AppError base class + NotFoundError, ForbiddenError,
     ConflictError, ValidationError, BadRequestError
   - shared/utils/response.ts — sendSuccess, sendCreated, sendDeleted, sendPaginated helpers
   - middleware/validate.ts — factory: validate(zodSchema, target?) → Express middleware
   - middleware/auth.middleware.ts — JWT verify → attach req.user or throw UnauthorizedError
   - middleware/error.middleware.ts — global error handler: AppError → structured JSON;
     unknown → log stack + return generic 500

Do NOT implement business logic yet. I will fill in the service/repository bodies myself.
Write clean TypeScript with no `any`. Use named exports throughout.
```

---

**2. Scalability bottleneck audit and documentation**

```
You are a senior software engineer specializing in backend performance and scalability.

I need you to perform a thorough scalability audit of this codebase. Use the Explore
subagent to read every relevant file before forming any conclusions — do not guess
based on file names alone.

Files to read in full before starting:
- packages/backend/src/modules/campaigns/campaign.service.ts
- packages/backend/src/modules/campaigns/campaign.repository.ts
- packages/backend/src/modules/campaigns/send.service.ts
- packages/backend/src/modules/campaigns/campaign.scheduler.ts
- packages/backend/src/modules/recipients/recipient.repository.ts
- packages/backend/src/middleware/rateLimiter.middleware.ts
- packages/frontend/src/hooks/useCampaignStats.ts
- packages/frontend/src/hooks/useCampaigns.ts
- packages/frontend/src/components/RecipientTable.tsx
- packages/frontend/src/pages/CampaignDetail/CampaignDetailPage.tsx
- docker-compose.yml

After reading, produce SCALABLE.md with the following structure:

For each problem found:
- Describe exactly what the code does today (quote the relevant lines)
- Explain what breaks at scale and at what approximate threshold (rows, RPS, instances)
- Provide the SQL or code that demonstrates the problem
- Give a concrete fix with before/after code snippets

Organize problems into: Critical / High / Medium / Low (infrastructure) / Frontend.
End with a numbered priority table: Problem | Impact | Urgency.

Be specific. Do not include generic advice that isn't grounded in the actual code.
I will review and reprioritize before we implement anything.
```

---

**3. BullMQ async architecture refactor (guided by SCALABLE.md findings)**

```
Based on the two Critical problems identified in SCALABLE.md — the in-process send loop
(§1.1) and the in-process cron scheduler race condition (§1.2) — implement the full
BullMQ migration. Follow the target architecture described in SCALABLE.md exactly.

Use the Plan subagent first to map out every file that needs to change and the order
of changes, then implement.

Step 1 — Infrastructure
- Add Redis service to docker-compose.yml (port 6380, redis:7-alpine, health check)
- Add worker service to docker-compose.yml (runs `yarn workspace backend worker`,
  depends_on postgres + redis)
- Add ioredis + bullmq to packages/backend/package.json
- Create packages/backend/src/config/redis.ts — IORedis connection factory using
  config.redis.host/port/password; export createRedisConnection()

Step 2 — Queue singleton
- Create packages/backend/src/queue/index.ts
- Export getCampaignQueue() — lazy singleton BullMQ Queue named 'campaign-send'
- Default job options: attempts: 3, exponential backoff starting at 5s,
  removeOnComplete: { count: 100 }, removeOnFail: { count: 200 }

Step 3 — Worker process
- Create packages/backend/src/workers/campaign.worker.ts
- Must run as a standalone process (loads dotenv, connects DB, then starts Worker)
- Consumes 'campaign-send' queue; calls the existing send.service.ts executeSend()
  — do not duplicate the send logic
- On job failure: log with attempt count
- On permanent failure (all retries exhausted): reset campaign.status to 'draft'
  so the user can retry manually
- Log worker start with concurrency level

Step 4 — Replace setImmediate with queue.add() in campaign.service.ts
- In CampaignService.send(): remove setImmediate(executeSend); add getCampaignQueue()
  .add('send', { campaignId }, { jobId: `campaign-${id}` })  ← idempotent jobId
- In CampaignService.schedule(): remove the cron approach; instead call
  getCampaignQueue().add('send', { campaignId }, { jobId: `campaign-${id}`, delay })

Step 5 — Deprecate the in-process scheduler
- Replace campaign.scheduler.ts body with a no-op stub and a comment explaining
  that scheduling is now handled by BullMQ delayed jobs

Step 6 — Add worker scripts to package.json
- "worker": "ts-node src/workers/campaign.worker.ts"
- "worker:prod": "node dist/workers/campaign.worker.js"

After all changes, run yarn workspace backend build to confirm zero TypeScript errors.
Then produce SOLUTION.md documenting: what each phase fixed, the before/after flow
diagrams, and any breaking API contract changes.
```

---

**4. Architecture documentation**

```
You are a senior technical writer and software architect.

Read the following files in full using the Explore subagent before writing anything:
- packages/backend/src/app.ts
- packages/backend/src/modules/auth/auth.service.ts
- packages/backend/src/modules/auth/auth.repository.ts
- packages/backend/src/modules/campaigns/campaign.service.ts
- packages/backend/src/modules/campaigns/campaign.repository.ts
- packages/backend/src/workers/campaign.worker.ts
- packages/backend/src/queue/index.ts
- packages/backend/src/middleware/ (all files)
- packages/backend/src/shared/ (all files)
- packages/frontend/src/store/auth.store.ts
- packages/frontend/src/api/client.ts
- packages/frontend/src/hooks/ (all files)
- docker-compose.yml
- SCALABLE.md
- SOLUTION.md

Then produce ARCHITECTURE.md covering:

1. High-level system diagram (ASCII art) showing Browser → API → DB + Redis + Worker
2. Full request lifecycle from HTTP in to response out (every middleware step)
3. Backend layer responsibilities table: Layer | File pattern | Responsibility |
   What it must NOT do
4. Frontend architecture: folder responsibilities, state management strategy table
   (what lives in React Query vs Zustand vs useState), data flow rules
5. Async send design: current flow diagram + BullMQ job lifecycle + failure/retry path
6. Auth token strategy: token types table, full token rotation sequence diagram
   (ASCII), security design decisions table with rationale for each decision
7. API design principles: endpoint structure, HTTP status code table, pagination
   contract, standardized response shapes with examples, error codes reference
8. Logging strategy: what gets logged at each level, what must NEVER be logged (PII),
   log format example
9. Scalability section: link to SCALABLE.md, summarize the three architectural
   decisions already built in (denormalized counters, batched updates, BullMQ)
10. Trade-offs: intentional simplifications table + what was NOT simplified table +
    upgrade path summary

Be precise — quote actual type names, file paths, and function names from the code.
Do not invent abstractions that don't exist in the codebase.
```

### Where Claude Code was wrong or needed correction

**Architecture & Performance**

- **Pagination mismatch broke the UI** — Claude chose cursor-based pagination for the API (`nextCursor / hasMore`), but the frontend expected page numbers (`total`, `page`, `totalPages`). The result: the campaigns list rendered nothing and showed no error. I spotted it by checking the raw API response and corrected Claude to use standard offset pagination with a `COUNT(*)`.

- **Stats endpoint re-counted every row on every request** — for each visit to the stats page, Claude issued 4 separate database count queries across all recipient rows. Fine for small data, but this would time out as the dataset grows. I directed Claude to store `sent_count` and `failed_count` directly on the campaign row and update them incrementally during the send — so stats became a single fast lookup instead of a full table scan.

- **"Async" send was still blocking the API** — Claude ran the email send loop in the same process as the API server, calling it "async" via `setImmediate`. In reality, it still consumed server resources and could slow down other users' requests during a large send. I required a truly separate worker process connected via a BullMQ job queue, so the API and the send workload run independently.

- **Server crash mid-send left campaigns stuck forever** — if the server crashed while sending, the campaign stayed in `sending` with no way to recover. Claude had no retry logic. I required BullMQ's built-in retry with exponential backoff, and a final fallback that resets the campaign to `draft` so it can be resent manually.

- **Scheduled campaigns could be sent twice** — Claude used a cron job that ran every minute inside each API server. If two servers were running at the same time, both would pick up the same scheduled campaign and trigger two sends. I flagged this race condition and required a fix: use BullMQ delayed jobs with a unique `jobId` per campaign, so the job runs exactly once regardless of how many servers are running.

**Security**

- **Rate limiter was bypassable on multiple servers** — Claude's rate limiter stored request counts in memory per process. An attacker could simply alternate between servers to reset their limit each time. I required the counter to live in Redis so all servers share the same state and the limit is actually enforced.

- **Login tokens stayed valid for 7 days if stolen** — Claude set the JWT lifetime to 7 days by default. A stolen token would give an attacker a full week of access with no way to block it. I reduced it to 15 minutes and added a refresh token system: short-lived access tokens, longer-lived refresh tokens stored as hashed values in the database, rotated on every use and revoked on logout.

**UI / User Experience**

- **Old account's data appeared after switching accounts** — logging out and back in with a different account still showed the previous user's campaigns. React Query kept the cache from the previous session and never cleared it on login. I found the issue by watching the network tab (no new request was being made) and fixed it by clearing the entire query cache on both manual logout and automatic session expiry.

- **Clicking "Send" appeared to do nothing** — the campaign status stayed on `sending` indefinitely after clicking Send. Claude had wired up the queue correctly, but the worker process was never started, so jobs piled up in Redis unprocessed. There was also no explanation in the UI or docs that a second terminal was needed. I diagnosed it by checking the Redis queue directly and added clear setup documentation.

- **Search spammed the API with every keystroke** — the search box triggered a new API request on every character typed. With 2,000 campaigns in the list, this caused a flood of requests and visible flickering. I added a 400ms debounce so the API is only called when the user pauses, and synced the search term to the URL so it persists when navigating back.

### What I would NOT let Claude Code do

- **Edit security-sensitive files directly** — files like `auth.middleware.ts`, `auth.service.ts`, and anything touching JWT signing, password hashing, or token storage are off-limits for direct edits. I only allowed Claude to suggest changes in these areas, which I then reviewed and applied manually. A subtle mistake here — wrong algorithm, missing expiry check, storing a raw token instead of a hash — can compromise every user account.

- **Touch infrastructure config files** — `docker-compose.yml`, `.env.example`, and any deployment or CI configuration can only be modified by me. Claude can recommend what to add or change, but it does not have the full picture of the production environment: which ports are exposed externally, what secrets are injected at runtime, or how services are networked. An unreviewed change here could expose a service to the internet or break a running deployment.

- **Delete any data** — Claude is not permitted to run or generate any `DELETE`, `DROP`, or `TRUNCATE` statements against a real database, even in a development context. The seed script only uses `INSERT` and `findOrCreate`. Any cleanup of existing data is done manually after I verify what will be removed.

- **Decide on auth token lifetimes and rotation policy** — the specific choices of 15-minute access tokens, 7-day refresh tokens, single-use rotation, and SHA-256 hashing of refresh tokens in the database are security decisions I made myself based on the threat model. Claude defaults to whatever is simplest (often a 7-day JWT with no refresh), which is not acceptable when account takeover is a real risk.

- **Make schema changes without explicit approval** — adding or removing columns, changing column types, or modifying indexes can corrupt existing data or break running queries in ways that are hard to reverse. Claude can propose schema changes, but I review every migration file before it runs.
