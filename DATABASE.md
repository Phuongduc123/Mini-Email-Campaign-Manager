# Database Schema — Mini Campaign Manager

PostgreSQL schema designed for large-scale email marketing workloads (millions of recipients).

---

## Table of Contents

1. [Schema Design Decisions](#1-schema-design-decisions)
2. [CREATE TABLE Statements](#2-create-table-statements)
3. [Indexes](#3-indexes)
4. [Constraints Summary](#4-constraints-summary)
5. [Suggested Improvements & Additional Fields](#5-suggested-improvements--additional-fields)
6. [Performance Bottlenecks & Mitigations](#6-performance-bottlenecks--mitigations)

---

## 1. Schema Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary key type | `UUID` (gen_random_uuid()) | Avoids sequential ID enumeration, safe for distributed inserts |
| Status fields | PostgreSQL native `ENUM` | Enforced at DB level, compact storage, readable in queries |
| Timestamps | `TIMESTAMPTZ` | Stores timezone offset; avoids UTC ambiguity in scheduled sends |
| campaign_recipients PK | Composite `(campaign_id, recipient_id)` | Naturally prevents duplicate enrollment, doubles as a covering index |
| Normalization | 3NF — no derived columns in core tables | Stats computed at query time; denormalized counters added as optional optimization (see §5) |

---

## 2. CREATE TABLE Statements

### 2.1 ENUM Types

```sql
-- Campaign lifecycle states (ordered progression)
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'sent');

-- Per-recipient delivery outcome
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'failed');
```

---

### 2.2 `users`

```sql
CREATE TABLE users (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255)  NOT NULL,
    name          VARCHAR(255)  NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
```

**Field notes:**
- `password_hash` — bcrypt/argon2 hash only, never plaintext
- `updated_at` — maintained by application layer (or trigger, see §5)
- Email `CHECK` constraint acts as a last-resort guard; primary validation lives in the app layer

---

### 2.3 `campaigns`

```sql
CREATE TABLE campaigns (
    id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255)     NOT NULL,
    subject      VARCHAR(255)     NOT NULL,
    body         TEXT             NOT NULL,
    status       campaign_status  NOT NULL DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ      NULL,        -- NULL when not scheduled
    created_by   UUID             NOT NULL,
    created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_campaigns_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,

    -- A scheduled campaign must have a scheduled_at timestamp
    CONSTRAINT chk_campaigns_scheduled_has_time
        CHECK (status != 'scheduled' OR scheduled_at IS NOT NULL),

    -- scheduled_at only makes sense for non-draft, non-sent campaigns
    CONSTRAINT chk_campaigns_scheduled_at_future
        CHECK (scheduled_at IS NULL OR scheduled_at > created_at)
);
```

**Field notes:**
- `ON DELETE RESTRICT` on `created_by` — prevents accidental user deletion from orphaning campaigns
- `chk_campaigns_scheduled_has_time` — DB-level guard that mirrors the app business rule

---

### 2.4 `recipients`

```sql
CREATE TABLE recipients (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL,
    name           VARCHAR(255) NOT NULL,
    unsubscribed_at TIMESTAMPTZ NULL,   -- NULL = active; set to timestamp on unsubscribe
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_recipients_email UNIQUE (email),
    CONSTRAINT chk_recipients_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
```

**Field notes:**
- `unsubscribed_at` — nullable timestamp rather than a boolean; preserves when the event happened (important for CAN-SPAM / GDPR compliance)
- The send worker MUST skip recipients where `unsubscribed_at IS NOT NULL`

---

### 2.5 `campaign_recipients`

```sql
CREATE TABLE campaign_recipients (
    campaign_id  UUID             NOT NULL,
    recipient_id UUID             NOT NULL,
    status       delivery_status  NOT NULL DEFAULT 'pending',
    sent_at      TIMESTAMPTZ      NULL,
    opened_at    TIMESTAMPTZ      NULL,
    error_message TEXT            NULL,   -- populated on status = 'failed'
    retry_count  SMALLINT         NOT NULL DEFAULT 0,

    PRIMARY KEY (campaign_id, recipient_id),

    CONSTRAINT fk_cr_campaign
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,

    CONSTRAINT fk_cr_recipient
        FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE RESTRICT,

    -- sent_at must exist when status is 'sent'
    CONSTRAINT chk_cr_sent_has_timestamp
        CHECK (status != 'sent' OR sent_at IS NOT NULL),

    -- opened_at implies sent_at (can't open an unsent email)
    CONSTRAINT chk_cr_opened_implies_sent
        CHECK (opened_at IS NULL OR sent_at IS NOT NULL)
);
```

**Field notes:**
- `ON DELETE CASCADE` on `campaign_id` — deleting a campaign cleans up all its delivery rows
- `ON DELETE RESTRICT` on `recipient_id` — prevents silently losing delivery history
- `error_message` — stores the SMTP/provider error string for failed rows (critical for debugging partial failures)
- `retry_count` — enables future retry logic without a separate table

---

## 3. Indexes

### 3.1 Index Definitions

```sql
-- ── users ────────────────────────────────────────────────────────────────────
-- Implicit from UNIQUE constraint — login lookup: WHERE email = ?
CREATE UNIQUE INDEX uq_users_email_idx ON users (email);

-- ── campaigns ────────────────────────────────────────────────────────────────
-- Hot path: every "list my campaigns" request filters by owner
CREATE INDEX idx_campaigns_created_by
    ON campaigns (created_by);

-- Low-cardinality filter (draft/scheduled/sending/sent); useful when combined
-- with created_by in the composite index below
CREATE INDEX idx_campaigns_status
    ON campaigns (status);

-- Composite: serves WHERE created_by = ? AND status = ? in a single index scan
-- More efficient than PostgreSQL combining the two single-column indexes above
CREATE INDEX idx_campaigns_created_by_status
    ON campaigns (created_by, status);

-- Covers ORDER BY id DESC pagination scans scoped to one user.
-- Without this, Postgres sorts after filtering; with 2 000+ campaigns per user it matters.
CREATE INDEX idx_campaigns_created_by_id
    ON campaigns (created_by, id);

-- ── recipients ───────────────────────────────────────────────────────────────
-- Implicit from UNIQUE constraint — duplicate-email check on create
CREATE UNIQUE INDEX uq_recipients_email_idx ON recipients (email);

-- Partial index covering only active (non-unsubscribed) recipients.
-- Used by the send worker JOIN: r.id = cr.recipient_id WHERE r.unsubscribed_at IS NULL
-- Keeps index size proportional to active recipients, not the full table.
CREATE INDEX idx_recipients_active
    ON recipients (id)
    WHERE unsubscribed_at IS NULL;

-- ── campaign_recipients  (hot table — updated on every send batch) ────────────
-- Primary key (campaign_id, recipient_id) already covers campaign_id-first lookups.

-- Composite for send worker batch loop + status-based stats aggregation
CREATE INDEX idx_cr_campaign_status
    ON campaign_recipients (campaign_id, status);

-- Partial: only 'pending' rows — the majority of rows are 'sent'/'failed' after
-- a campaign completes; keeping them out of the index reduces bloat significantly.
CREATE INDEX idx_cr_pending_work
    ON campaign_recipients (campaign_id)
    WHERE status = 'pending';

-- FK reverse-lookup: "which campaigns did this recipient receive?"
CREATE INDEX idx_cr_recipient_id
    ON campaign_recipients (recipient_id);

-- Partial: open-rate stats — countOpened() query:
-- WHERE campaign_id = ? AND opened_at IS NOT NULL
-- Skips the ~65% of rows where opened_at IS NULL (never opened).
CREATE INDEX idx_cr_opened_at
    ON campaign_recipients (campaign_id, opened_at)
    WHERE opened_at IS NOT NULL;
```

---

### 3.2 Index Rationale

| Index | Table | Query it serves | Why it matters |
|---|---|---|---|
| `uq_users_email_idx` | users | `WHERE email = ?` — login, register duplicate check | Without this, every login is a full table scan |
| `idx_campaigns_created_by` | campaigns | `WHERE created_by = $userId` — list campaigns | Base filter for every campaign list request |
| `idx_campaigns_status` | campaigns | `WHERE status = 'scheduled'` — scheduler polling | Low cardinality (4 values); useful standalone when scanning across all users |
| `idx_campaigns_created_by_status` *(composite)* | campaigns | `WHERE created_by = ? AND status = ?` | Single index scan vs. PostgreSQL merging two indexes — faster for filtered list with status param |
| `idx_campaigns_created_by_id` *(composite)* | campaigns | `WHERE created_by = ? ORDER BY id DESC` | Covers paginated list queries without a separate sort step |
| `uq_recipients_email_idx` | recipients | `WHERE email = ?` — duplicate email check | Required on every recipient create |
| `idx_recipients_active` *(partial)* | recipients | Worker JOIN: `r.id = cr.recipient_id WHERE r.unsubscribed_at IS NULL` | Partial index on active recipients only; scales well as unsubscribe list grows |
| `idx_cr_campaign_status` *(composite)* | campaign_recipients | `WHERE campaign_id = ? AND status = 'pending'` — worker batch; stats count | Serves both the send loop and stats aggregation in one scan |
| `idx_cr_pending_work` *(partial)* | campaign_recipients | Send worker batch `WHERE campaign_id = ? AND status = 'pending'` | Excludes completed rows (majority after send); index stays small as table grows to millions |
| `idx_cr_recipient_id` | campaign_recipients | `WHERE recipient_id = ?` — reverse FK lookup | PK is `(campaign_id, recipient_id)`; without this, recipient-first lookups are full scans |
| `idx_cr_opened_at` *(partial)* | campaign_recipients | `countOpened`: `WHERE campaign_id = ? AND opened_at IS NOT NULL` | Skips ~65% of rows (never opened); keeps open-rate queries O(opens) not O(all recipients) |

### 3.3 Migration History

| Migration file | Indexes added |
|---|---|
| `20240101000002-create-campaigns.ts` | `idx_campaigns_created_by`, `idx_campaigns_status` |
| `20240101000004-create-campaign-recipients.ts` | `idx_cr_campaign_id`, `idx_cr_recipient_id`, `idx_cr_campaign_status` |
| `20240101000005-create-refresh-tokens.ts` | `idx_refresh_tokens_user_id`, `idx_refresh_tokens_token_hash` |
| `20240101000006-add-performance-indexes.ts` | `idx_campaigns_created_by_status`, `idx_campaigns_created_by_id`, `idx_recipients_active`, `idx_cr_opened_at` |

---

## 4. Constraints Summary

| Table | Constraint | Type | Purpose |
|---|---|---|---|
| users | `uq_users_email` | UNIQUE | Prevents duplicate accounts |
| users | `chk_users_email_format` | CHECK | Basic email sanity (defense in depth) |
| campaigns | `fk_campaigns_created_by` | FK + RESTRICT | No orphaned campaigns |
| campaigns | `chk_campaigns_scheduled_has_time` | CHECK | `scheduled` status requires `scheduled_at` |
| recipients | `uq_recipients_email` | UNIQUE | One recipient record per email address |
| campaign_recipients | PK `(campaign_id, recipient_id)` | PRIMARY KEY | Prevents duplicate enrollment per campaign |
| campaign_recipients | `fk_cr_campaign` + CASCADE | FK | Cascade-delete rows when campaign is deleted |
| campaign_recipients | `fk_cr_recipient` + RESTRICT | FK | Protect delivery history from dangling recipient deletes |
| campaign_recipients | `chk_cr_sent_has_timestamp` | CHECK | `sent` rows must have `sent_at` |
| campaign_recipients | `chk_cr_opened_implies_sent` | CHECK | Cannot open what was never sent |

---

## 5. Suggested Improvements & Additional Fields

### 5.1 Denormalized Stats Counters on `campaigns`

At millions of recipients, computing stats via `COUNT` over `campaign_recipients` on every request is expensive. Add pre-aggregated counters:

```sql
ALTER TABLE campaigns ADD COLUMN total_recipients INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN sent_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN failed_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN opened_count     INTEGER NOT NULL DEFAULT 0;
```

- Increment `sent_count` / `failed_count` atomically in the send worker using `UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $id`
- `GET /campaigns/:id/stats` reads directly from this row — O(1) instead of O(n)
- Accept eventual consistency: counters may lag by 1–2 sends under high concurrency

---

### 5.2 `updated_at` Auto-Maintenance Trigger

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Ensures `updated_at` is never forgotten by application code.

---

### 5.3 Table Partitioning for `campaign_recipients`

At tens of millions of rows, consider range-partitioning by `created_at` (inferred from campaign) or list-partitioning by `status`:

```sql
-- Range partition by year (sketch — implement when row count exceeds ~50M)
CREATE TABLE campaign_recipients (
    ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE campaign_recipients_2024
    PARTITION OF campaign_recipients
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE campaign_recipients_2025
    PARTITION OF campaign_recipients
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

Partitioning allows old partitions to be archived or dropped without vacuuming the entire table.

---

### 5.4 Additional Fields Worth Considering

| Table | Field | Type | Reason |
|---|---|---|---|
| campaigns | `description` | TEXT NULL | Internal notes visible only to the campaign creator |
| campaigns | `reply_to_email` | VARCHAR(255) NULL | Different reply-to address from sender |
| recipients | `first_name` / `last_name` | VARCHAR(100) | Split name for personalization tokens in email body |
| recipients | `tags` | TEXT[] | Recipient segmentation without a separate join table |
| campaign_recipients | `bounce_type` | VARCHAR(50) NULL | `'hard'` vs `'soft'` bounce classification |
| campaign_recipients | `unsubscribed_via_campaign` | BOOLEAN | Whether the recipient unsubscribed through this campaign's link |

---

## 6. Performance Bottlenecks & Mitigations

### 6.1 `campaign_recipients` Write Amplification During Send

**Problem:** The async send worker updates one row per recipient — for a 1M-recipient campaign that's 1M individual `UPDATE` statements.

**Mitigation:**
- Batch updates: `UPDATE campaign_recipients SET status='sent', sent_at=NOW() WHERE campaign_id=$id AND recipient_id = ANY($ids::uuid[])` — update 100–500 rows per query
- Use a message queue (BullMQ / pg_boss) to fan out work across multiple workers in parallel with controlled concurrency

---

### 6.2 Stats Aggregation Query

**Problem:** `SELECT status, COUNT(*) FROM campaign_recipients WHERE campaign_id = $id GROUP BY status` scans all rows for a campaign.

**Mitigation:**
- Index `idx_cr_campaign_status` makes this an index-only scan (fast)
- Add denormalized counters (§5.1) to make it O(1)

---

### 6.3 Scheduler Polling

**Problem:** A background job polling `WHERE status = 'scheduled' AND scheduled_at <= NOW()` runs frequently and could lock rows.

**Mitigation:**
- Partial index `idx_campaigns_scheduled_at` keeps the index tiny
- Use `SELECT ... FOR UPDATE SKIP LOCKED` to avoid contention between multiple scheduler replicas:

```sql
SELECT id FROM campaigns
WHERE status = 'scheduled' AND scheduled_at <= NOW()
ORDER BY scheduled_at
LIMIT 10
FOR UPDATE SKIP LOCKED;
```

---

### 6.4 Unsubscribe Check on Every Send

**Problem:** Before sending each email, the worker must verify `recipients.unsubscribed_at IS NULL`.

**Mitigation:**
- Join once when fetching the pending batch rather than per-row:

```sql
SELECT cr.recipient_id, r.email, r.name
FROM campaign_recipients cr
JOIN recipients r ON r.id = cr.recipient_id
WHERE cr.campaign_id = $campaignId
  AND cr.status = 'pending'
  AND r.unsubscribed_at IS NULL
LIMIT 500;
```

- `idx_cr_pending_work` + the recipient PK lookup handles this efficiently

---

### 6.5 VACUUM Pressure on High-Churn Tables

**Problem:** `campaign_recipients` rows transition through 3 status values — each `UPDATE` creates dead tuples. At scale, autovacuum may fall behind.

**Mitigation:**
- Tune `autovacuum_vacuum_scale_factor = 0.01` (1% threshold instead of 20%) for this table specifically
- Consider `FILLFACTOR = 70` on `campaign_recipients` to reserve page space for in-place updates (HOT updates avoid index bloat)

```sql
ALTER TABLE campaign_recipients SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.01);
```

---

*Schema version: 1.1 — last updated 2026-04-05*
