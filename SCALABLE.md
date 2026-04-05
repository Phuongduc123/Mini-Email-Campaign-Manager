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

### 1.2 In-Process Cron Scheduler — No Distributed Lock

The campaign scheduler (`campaign.scheduler.ts`) runs a `node-cron` job every minute inside the same process as the HTTP server. At scale:

- **Multi-instance race condition:** Two instances running simultaneously both SELECT the same `scheduled` campaigns before either has committed the `sending` status update — the same campaign gets dispatched twice, emails sent twice.
- **No crash recovery:** If the process dies between `scheduledAt` and the next tick, the campaign is never dispatched until the server restarts. There is no persistent record that a dispatch was missed.
- **Overlapping ticks:** A tick that takes >1 minute (large campaign) will overlap with the next tick — `status='sending'` prevents double-dispatch for that campaign, but the cron queue grows unbounded.
- **Couples scheduling with HTTP serving:** A slow send loop consumes event-loop resources that should be serving API requests.

**Fix:** Replace the in-process cron with a job queue (BullMQ + Redis) and a dedicated worker process. The scheduler enqueues a job at schedule time; the worker consumes it exactly once with at-least-once delivery guarantees and automatic retry.

```
Current:  [cron tick] → SELECT due → UPDATE sending → executeSend (in-process)
Target:   [POST /schedule] → enqueue(jobId, runAt) → [Worker] → executeSend (separate process)
```

For multi-instance deployments before a full queue migration, a Redis-based distributed lock (`redlock`) on the cron tick prevents double-dispatch as an interim fix.

---


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

## 5. Frontend UX & Performance Problems

### 5.1 `RecipientTable` Renders Entire Array — No Virtualization

`CampaignDetailPage` passes the full `campaign.campaignRecipients` array directly to `RecipientTable` with no size limit:

```tsx
// CampaignDetailPage.tsx
<RecipientTable recipients={campaign.campaignRecipients ?? []} />
```

At 10,000 recipients: 10,000 `<tr>` nodes in the DOM simultaneously → browser UI thread blocks → page freezes. The table has no pagination controls and no virtual scrolling.

**Fix:** Paginate the recipients sub-resource on the backend (`GET /campaigns/:id/recipients?page=1&limit=50`) and add pagination controls to `RecipientTable`, or use `@tanstack/react-virtual` to render only visible rows:

```tsx
// Option A — server-side pagination
const { data } = useQuery({
  queryKey: ['campaign-recipients', id, page],
  queryFn: () => campaignsApi.getRecipients(id, { page, limit: 50 }),
});

// Option B — virtual scroll (client-side, avoids extra API)
const rowVirtualizer = useVirtualizer({
  count: recipients.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 45,
});
```

---

### 5.2 Stats Polling Every 2 Seconds — No Backoff or Ceiling

```ts
// useCampaignStats.ts
refetchInterval: campaignStatus === 'sending' ? 2000 : false,
```

With 1,000 concurrent users viewing a sending campaign: **30,000 requests/minute** to `/campaigns/:id/stats`. There is no upper bound on how long the poll runs, no backoff, and no check for page visibility.

**Fix:** Stop polling when tab is backgrounded, increase the interval, and cap the total poll duration. Long-term, replace polling with Server-Sent Events (SSE):

```ts
// Short-term: controlled polling
refetchInterval: campaignStatus === 'sending' ? 5000 : false,
refetchIntervalInBackground: false,  // stops when tab is hidden

// Long-term: SSE push from the send worker
const eventSource = new EventSource(`/api/v1/campaigns/${id}/progress`);
eventSource.onmessage = (e) => queryClient.setQueryData(['campaign-stats', id], JSON.parse(e.data));
```

---

### 5.3 Recipient Checkbox List — No Search, No Virtual Scroll

```tsx
// CampaignForm.tsx
<div className="border ... max-h-48 overflow-y-auto">
  {recipients.map((r) => ( <label> <input type="checkbox" /> </label> ))}
</div>
```

`useRecipients(page=1, limit=100)` loads 100 recipients into a fixed-height scrollbox with no search or filter. Directly mirrors the backend problem (SCALABLE.md §2.3): sending 100K recipient IDs in a JSON body is infeasible. The UI has no mechanism for segment/tag-based selection.

**Fix:** Replace the checkbox list with a segment/tag selector that mirrors the backend targeting model, plus a search input for manual selection:

```tsx
// Replace recipientIds[] with segmentId
<select {...register('segmentId')}>
  {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
</select>

// If keeping manual selection: add debounced search
const [search, setSearch] = useState('');
const filtered = useMemo(
  () => recipients.filter(r => r.name.toLowerCase().includes(search.toLowerCase())),
  [recipients, search],
);
```

---

### 5.4 No `staleTime` — Unnecessary Refetches on Every Navigation

All query hooks (`useCampaigns`, `useCampaign`, `useCampaignStats`, `useRecipients`) use the default `staleTime: 0`. Every component mount and every tab-focus triggers an immediate background refetch, even if the data is seconds old.

**Fix:** Set appropriate `staleTime` per query type:

```ts
// useCampaigns.ts — list changes rarely
useQuery({ ..., staleTime: 30_000 })

// useCampaign.ts — details change on user action only
useQuery({ ..., staleTime: 60_000 })

// useCampaignStats.ts — already polls during send; staleTime irrelevant
// useRecipients.ts — recipient list is effectively static
useQuery({ ..., staleTime: 5 * 60_000 })
```

---

### 5.5 Pagination State Lost on Back-Navigation

```tsx
// CampaignsPage.tsx
const [page, setPage] = useState(1);  // reset to 1 on every mount
```

A user on page 5 who navigates to a campaign detail and returns is sent back to page 1. At scale with hundreds of campaigns across many pages, this is a significant UX regression.

**Fix:** Persist page in the URL query string:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const page = Number(searchParams.get('page') ?? '1');
const setPage = (p: number) => setSearchParams({ page: String(p) });
```

---

### 5.6 No Code Splitting — Full Bundle on First Load

All pages are imported eagerly in `App.tsx`. The entire application bundle (including campaign detail, form, recipient table) is downloaded even when the user lands on the login page.

**Fix:** Lazy-load route components:

```tsx
// App.tsx
const CampaignsPage     = lazy(() => import('@/pages/Campaigns/CampaignsPage'));
const CampaignDetailPage = lazy(() => import('@/pages/CampaignDetail/CampaignDetailPage'));
const NewCampaignPage   = lazy(() => import('@/pages/NewCampaign/NewCampaignPage'));

<Suspense fallback={<PageSkeleton />}>
  <Routes> ... </Routes>
</Suspense>
```

---

### 5.7 Redundant Query Invalidation After Send

```ts
// useSendCampaign.ts
onSuccess: (updated) => {
  queryClient.setQueryData(['campaign', id], updated);   // ← sets cache
  queryClient.invalidateQueries({ queryKey: ['campaign', id] }); // ← immediately marks stale → refetch
```

`setQueryData` is overwritten by `invalidateQueries` on the very next tick, making the optimistic set a no-op and causing an extra network request.

**Fix:** Use `setQueryData` alone for the immediate update, skip the redundant invalidation of the same key:

```ts
onSuccess: (updated) => {
  queryClient.setQueryData(['campaign', id], updated);
  // only invalidate the list — detail is already fresh
  queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  queryClient.invalidateQueries({ queryKey: ['campaign-stats', id] });
},
```

---

### 5.8 `window.confirm()` for Destructive Actions

```tsx
if (!window.confirm('Send this campaign now? This cannot be undone.')) return;
```

The native browser `confirm` dialog is synchronous, blocks the JS thread, cannot be styled, and on some mobile browsers is suppressed entirely when triggered inside async callbacks.

**Fix:** Replace with a controlled modal component:

```tsx
const [confirmOpen, setConfirmOpen] = useState(false);

<ConfirmModal
  open={confirmOpen}
  title="Send Campaign"
  description="This will send to all recipients immediately and cannot be undone."
  onConfirm={() => { send(); setConfirmOpen(false); }}
  onCancel={() => setConfirmOpen(false)}
/>
```

---

### 5.9 No React Error Boundary

No `ErrorBoundary` component wraps any route or subtree. An unhandled render error (e.g. a malformed API response causing a `.map()` on `undefined`) crashes the entire application with a blank white screen and no recovery path.

**Fix:** Wrap each route in an error boundary:

```tsx
<ErrorBoundary fallback={<ErrorPage />}>
  <CampaignDetailPage />
</ErrorBoundary>
```

---

## 6. Priority Summary

| # | Problem | Impact | Urgency |
|---|---|---|---|
| 1 | Single-process send loop | Data loss on crash, cannot scale horizontally | **Critical** |
| 2 | In-process cron scheduler, no distributed lock | Double-send on multi-instance, no crash recovery | **Critical** |
| 3 | Live stats aggregation | Query timeout at scale | **High** |
| 4 | Unpaginated `GET /recipients` | OOM / server crash | **High** |
| 5 | Recipient IDs in request body | 4MB+ payloads, single transaction timeout | **High** |
| 6 | No rate limiting on auth | Security + resource exhaustion | **Medium** |
| 7 | Offset pagination on campaigns | Slow at page 500+ | **Medium** |
| 8 | No unsubscribe flow | Legal / deliverability risk | **Medium** |
| 9 | No read replicas / connection pooling | DB saturation under sustained load | **Low (infra)** |
| 10 | `RecipientTable` no virtualization | Browser freeze at 10K+ recipients | **Critical (FE)** |
| 11 | Stats polling 2s, no backoff | 30K req/min at 1K concurrent users | **High (FE)** |
| 12 | Recipient checkbox list, no search | Unusable at 1K+ recipients | **High (FE)** |
| 13 | No `staleTime` on queries | Unnecessary refetches on every navigation | **Medium (FE)** |
| 14 | Pagination state lost on back-navigation | UX regression at large datasets | **Medium (FE)** |
| 15 | No code splitting | Large initial bundle, slow TTI | **Medium (FE)** |
| 16 | Redundant query invalidation after send | Extra network request per send action | **Low (FE)** |
| 17 | `window.confirm` for destructive actions | Broken UX on mobile | **Low (FE)** |
| 18 | No React Error Boundary | Full app crash on any render error | **Medium (FE)** |

---

*Analysis version: 1.2 — last updated 2026-04-04*
