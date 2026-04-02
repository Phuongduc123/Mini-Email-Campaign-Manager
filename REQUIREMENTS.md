# Mini Campaign Manager — Requirements Analysis

## Project Overview

A full-stack MarTech tool for creating, managing, and tracking email campaigns.

- **Monorepo:** Yarn workspaces (backend + frontend in same repo)
- **Time estimate:** 4–8 hours
- **Deliverable:** Public GitHub repo + written walkthrough

---

## Architecture Decision Summary

| Layer | Technology |
|---|---|
| Backend runtime | Node.js + Express |
| Database | PostgreSQL + Sequelize ORM |
| Auth | JWT (middleware) |
| Validation | Zod or Joi |
| Migrations | Sequelize migrations |
| Frontend | React 18 + TypeScript (Vite) |
| State management | Zustand or Redux |
| Data fetching | React Query or SWR |
| UI library | shadcn/ui, Chakra, MUI, or Tailwind (any) |
| Monorepo | Yarn workspaces |
| Infra | Docker Compose (for local setup) |

---

## Part 1 — Backend

### 1.1 Database Schema

#### Table: `users`
| Column | Type | Constraints |
|---|---|---|
| id | UUID / SERIAL | PRIMARY KEY |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| name | VARCHAR(255) | NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### Table: `campaigns`
| Column | Type | Constraints |
|---|---|---|
| id | UUID / SERIAL | PRIMARY KEY |
| name | VARCHAR(255) | NOT NULL |
| subject | VARCHAR(255) | NOT NULL |
| body | TEXT | NOT NULL |
| status | ENUM | `draft` \| `sending` \| `scheduled` \| `sent` — DEFAULT `draft` |
| scheduled_at | TIMESTAMP | NULLABLE |
| created_by | FK → users.id | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

> Note: `sending` is a transient status used during the async send process.

#### Table: `recipients`
| Column | Type | Constraints |
|---|---|---|
| id | UUID / SERIAL | PRIMARY KEY |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| name | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### Table: `campaign_recipients`
| Column | Type | Constraints |
|---|---|---|
| campaign_id | FK → campaigns.id | NOT NULL |
| recipient_id | FK → recipients.id | NOT NULL |
| sent_at | TIMESTAMP | NULLABLE |
| opened_at | TIMESTAMP | NULLABLE |
| status | ENUM | `pending` \| `sent` \| `failed` — DEFAULT `pending` |
| PRIMARY KEY | (campaign_id, recipient_id) | composite |

#### Required Indexes (with rationale)

| Index | Table | Reason |
|---|---|---|
| `idx_campaigns_created_by` | campaigns | Filter campaigns by owner |
| `idx_campaigns_status` | campaigns | Filter/sort by status |
| `idx_campaign_recipients_campaign_id` | campaign_recipients | Fast recipient lookup per campaign |
| `idx_campaign_recipients_status` | campaign_recipients | Aggregate stats queries |
| `idx_campaign_recipients_recipient_id` | campaign_recipients | Reverse lookup — which campaigns a recipient is in |
| `idx_recipients_email` | recipients | Dedup check on insert |

---

### 1.2 API Endpoints

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register new user, return JWT |
| POST | `/auth/login` | No | Login, return JWT |

**POST /auth/register — Request body:**
```json
{ "email": "string", "name": "string", "password": "string" }
```

**POST /auth/login — Request body:**
```json
{ "email": "string", "password": "string" }
```

**Auth response shape:**
```json
{ "token": "jwt_string", "user": { "id": 1, "email": "...", "name": "..." } }
```

---

#### Campaigns

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/campaigns` | Yes | List all campaigns (paginated) |
| POST | `/campaigns` | Yes | Create new campaign |
| GET | `/campaigns/:id` | Yes | Campaign detail + recipient stats |
| PATCH | `/campaigns/:id` | Yes | Update campaign (draft only) |
| DELETE | `/campaigns/:id` | Yes | Delete campaign (draft only) |
| POST | `/campaigns/:id/schedule` | Yes | Schedule campaign (set scheduled_at) |
| POST | `/campaigns/:id/send` | Yes | Trigger async send simulation |
| GET | `/campaigns/:id/stats` | Yes | Return aggregate stats |

**GET /campaigns — Query params:**
- `page` (default: 1), `limit` (default: 20), `status` (optional filter)

**POST /campaigns — Request body:**
```json
{
  "name": "string",
  "subject": "string",
  "body": "string",
  "recipientIds": [1, 2, 3]
}
```

**POST /campaigns/:id/schedule — Request body:**
```json
{ "scheduled_at": "ISO8601 future timestamp" }
```

**GET /campaigns/:id/stats — Response:**
```json
{
  "total": 0,
  "sent": 0,
  "failed": 0,
  "opened": 0,
  "open_rate": 0.0,
  "send_rate": 0.0
}
```

---

#### Recipients

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/recipients` | Yes | List all recipients |
| POST | `/recipient` | Yes | Create a new recipient |

**POST /recipient — Request body:**
```json
{ "email": "string", "name": "string" }
```

---

### 1.3 Business Rules

| Rule | Details |
|---|---|
| Edit guard | Campaign can only be edited (`PATCH`) when `status = draft` → 409 Conflict otherwise |
| Delete guard | Campaign can only be deleted when `status = draft` → 409 Conflict otherwise |
| Schedule validation | `scheduled_at` must be a future timestamp → 422 Unprocessable Entity if in the past |
| Send transition | `send` sets status to `sending` immediately, then processes async. Final status → `sent`. Cannot be undone |
| Async send simulation | Each `CampaignRecipient` is randomly marked `sent` or `failed`, `sent_at` recorded |
| Stats computation | `open_rate = opened / sent`, `send_rate = sent / total` (handle division by zero) |

---

### 1.4 Error Response Shape

```json
{
  "error": "CAMPAIGN_NOT_DRAFT",
  "message": "Campaign cannot be edited after it has been scheduled or sent.",
  "statusCode": 409
}
```

---

### 1.5 Tests (minimum 3)

| # | Test | Type |
|---|---|---|
| 1 | Cannot PATCH a non-draft campaign | Integration |
| 2 | Cannot DELETE a non-draft campaign | Integration |
| 3 | `scheduled_at` must be a future date | Unit / Integration |
| 4 | (Bonus) Stats calculation correctness | Unit |
| 5 | (Bonus) Send transitions status to `sending` → `sent` | Integration |

---

## Part 2 — Frontend

### 2.1 Pages & Routes

| Route | Page | Auth required |
|---|---|---|
| `/login` | Login form | No |
| `/campaigns` | Campaign list | Yes |
| `/campaigns/new` | Create campaign form | Yes |
| `/campaigns/:id` | Campaign detail | Yes |

---

### 2.2 Page Details

#### `/login`
- Email + password fields
- On submit: call `POST /auth/login`, store JWT (httpOnly cookie preferred, or in-memory)
- Redirect to `/campaigns` on success
- Show error message on failure

#### `/campaigns`
- Paginated or infinite-scroll list of campaigns
- Each row shows: name, status badge, created_at, action buttons
- Status badge colors:
  - `draft` → grey
  - `scheduled` → blue
  - `sending` → yellow/orange
  - `sent` → green
- Button: "New Campaign" → navigates to `/campaigns/new`

#### `/campaigns/new`
- Form fields: name, subject, body (textarea), recipient selector (multi-select from existing recipients or paste emails)
- Submit → `POST /campaigns`
- Redirect to `/campaigns/:id` on success

#### `/campaigns/:id`
- Header: campaign name, status badge
- Stats section: open rate + send rate (progress bar or simple chart)
- Recipient list table: email, name, status, sent_at, opened_at
- Action buttons (conditional on status):
  - `draft` → Show: Schedule, Send, Delete
  - `scheduled` → Show: Send
  - `sending` → Show: (none / disabled)
  - `sent` → Show: (none)

---

### 2.3 UI Requirements

| Feature | Detail |
|---|---|
| Loading states | Skeleton loaders or spinners during data fetch |
| Error handling | Display API error messages inline, not just console |
| Status badge | Color-coded, as described above |
| Stats display | Progress bar or minimal chart for open_rate / send_rate |
| Conditional actions | Buttons rendered/hidden based on campaign status |

---

### 2.4 Tech Stack Details

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript, bootstrapped with Vite |
| State management | Zustand (preferred) or Redux |
| Data fetching | React Query (preferred) or SWR |
| HTTP client | Axios or native fetch |
| UI library | shadcn/ui, Chakra UI, MUI, or Tailwind CSS |
| Auth storage | httpOnly cookie or in-memory (no localStorage for JWT) |

---

## Part 3 — Monorepo Structure

```
email-marketing-system/
├── package.json                  # root — yarn workspaces config
├── docker-compose.yml
├── .env.example
├── README.md
├── REQUIREMENTS.md               # this file
│
├── packages/
│   ├── backend/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   │   ├── models/       # Sequelize models
│   │   │   │   └── migrations/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── campaigns.ts
│   │   │   │   └── recipients.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts       # JWT middleware
│   │   │   │   └── validate.ts   # Zod/Joi middleware
│   │   │   ├── services/
│   │   │   │   ├── campaign.service.ts
│   │   │   │   └── send.service.ts  # async send simulation
│   │   │   └── tests/
│   │   └── tsconfig.json
│   │
│   └── frontend/
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api/              # API client functions
│       │   ├── components/       # shared UI components
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Campaigns.tsx
│       │   │   ├── NewCampaign.tsx
│       │   │   └── CampaignDetail.tsx
│       │   ├── store/            # Zustand or Redux store
│       │   └── hooks/            # React Query hooks
│       └── tsconfig.json
```

---

## Part 4 — AI Usage (README section required)

The `README.md` must include a section **"How I Used Claude Code"** covering:

1. What tasks were delegated to Claude Code
2. 2–3 real prompts used (copy-paste actual prompts)
3. Where Claude Code was wrong or needed correction
4. What was NOT delegated to Claude Code — and why

---

## Part 5 — Submission Checklist

- [ ] Public GitHub repository
- [ ] `docker-compose up` works for local setup
- [ ] Seed data or demo script included
- [ ] README.md with local setup instructions
- [ ] README.md "How I Used Claude Code" section
- [ ] At least 3 meaningful backend tests passing
- [ ] All API endpoints implemented
- [ ] All 4 frontend pages implemented
- [ ] Repo link + walkthrough summary sent

---

## Evaluation Criteria

| Criteria | What is assessed |
|---|---|
| Backend correctness | Business rules enforced, SQL efficiency |
| API design | REST conventions, HTTP status codes, response shapes |
| Frontend quality | UX polish, loading/error states |
| Code quality | Readability, separation of concerns |
| AI collaboration | Judgment shown in AI usage, transparency |
| Testing | Meaningful test coverage |

---

## Open Questions / Decisions to Make

- [ ] JWT storage: httpOnly cookie vs in-memory? (httpOnly recommended for security)
- [ ] Async send: use `setTimeout` simulation, BullMQ, or direct async loop?
- [ ] Pagination style: offset-based or cursor-based?
- [ ] `open_rate` tracking: simulate with random `opened_at` during send, or separate endpoint later?
- [ ] Recipient input on campaign creation: select from existing recipients, or allow adding new ones inline?
