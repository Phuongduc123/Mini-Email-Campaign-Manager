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
- **Auth**: JWT access token + refresh token flow; refresh tokens stored in `refresh_tokens` table
- **Send simulation**: `modules/campaigns/send.service.ts` randomly marks recipients sent/failed — this is the placeholder for real email delivery

## Known Scalability Limitations (documented in SCALABLE.md)

- Email sending is synchronous in-process (no queue) — data loss on crash
- `/recipients` has no pagination — will OOM with large datasets
- Campaign stats are aggregated live on every request — will degrade at scale
