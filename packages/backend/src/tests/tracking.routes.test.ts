/**
 * Integration tests for GET /track/open
 *
 * Covers:
 *  - Always returns 200 with Content-Type: image/gif
 *  - Response body is the exact 1×1 transparent GIF bytes
 *  - Cache-Control / Pragma / Expires headers prevent caching
 *  - On first open: CampaignRecipient.update called with openedAt + idempotent filter
 *  - On second call (already opened): update called but affects 0 rows (idempotency)
 *  - Invalid params (non-numeric, missing): pixel still returned, no DB call made
 *  - DB error mid-open: pixel still returned (never 5xx to email client)
 */

import request from 'supertest';
import express from 'express';
import { trackingRouter } from '../modules/tracking/tracking.routes';

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Model mock ─────────────────────────────────────────────────────────────────

const mockCRUpdate = jest.fn();

jest.mock('../database/models/CampaignRecipient', () => ({
  CampaignRecipient: {
    update: (...args: unknown[]) => mockCRUpdate(...args),
  },
}));

// ── App fixture ────────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use('/track', trackingRouter);
  return app;
}

// The exact 1×1 transparent GIF used in tracking.routes.ts
const PIXEL_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const PIXEL = Buffer.from(PIXEL_BASE64, 'base64');

beforeEach(() => {
  jest.clearAllMocks();
  mockCRUpdate.mockResolvedValue([1]); // 1 row affected = first open
});

// ── Always returns the pixel ───────────────────────────────────────────────────

describe('GET /track/open — pixel response', () => {
  it('returns 200 for valid params', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?c=1&r=2');
    expect(res.status).toBe(200);
  });

  it('returns Content-Type: image/gif', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?c=1&r=2');
    expect(res.headers['content-type']).toMatch(/image\/gif/);
  });

  it('returns the exact GIF bytes', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/track/open?c=1&r=2')
      .buffer(true)
      .parse((res, fn) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });

    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body).toEqual(PIXEL);
  });

  it('sets Cache-Control: no-store', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?c=1&r=2');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('sets Pragma: no-cache', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?c=1&r=2');
    expect(res.headers['pragma']).toBe('no-cache');
  });
});

// ── open tracking: first open ─────────────────────────────────────────────────

describe('GET /track/open — first open (idempotent write)', () => {
  it('calls CampaignRecipient.update with correct campaignId and recipientId', async () => {
    mockCRUpdate.mockResolvedValue([1]);
    const app = makeApp();

    // Fire and wait for async update by giving it a tick
    await request(app).get('/track/open?c=5&r=10');
    await new Promise((r) => setImmediate(r));

    expect(mockCRUpdate).toHaveBeenCalledTimes(1);
    const [data, opts] = mockCRUpdate.mock.calls[0];

    expect(data).toHaveProperty('openedAt');
    expect(opts.where.campaignId).toBe(5);
    expect(opts.where.recipientId).toBe(10);
  });

  it('passes openedAt: null in where clause to prevent double-counting', async () => {
    mockCRUpdate.mockResolvedValue([1]);
    const app = makeApp();

    await request(app).get('/track/open?c=5&r=10');
    await new Promise((r) => setImmediate(r));

    const [, opts] = mockCRUpdate.mock.calls[0];
    expect(opts.where.openedAt).toBeNull();
  });
});

// ── Idempotency: second open ───────────────────────────────────────────────────

describe('GET /track/open — idempotency (already opened)', () => {
  it('still returns 200 on second request', async () => {
    mockCRUpdate.mockResolvedValue([0]); // 0 rows = already opened
    const app = makeApp();

    const res = await request(app).get('/track/open?c=5&r=10');
    expect(res.status).toBe(200);
  });

  it('calls update on second request but affects 0 rows', async () => {
    mockCRUpdate
      .mockResolvedValueOnce([1]) // first open
      .mockResolvedValueOnce([0]); // second — already opened

    const app = makeApp();

    await request(app).get('/track/open?c=5&r=10');
    await new Promise((r) => setImmediate(r));

    await request(app).get('/track/open?c=5&r=10');
    await new Promise((r) => setImmediate(r));

    expect(mockCRUpdate).toHaveBeenCalledTimes(2);
  });
});

// ── Invalid / missing params ───────────────────────────────────────────────────

describe('GET /track/open — invalid params', () => {
  it('returns 200 (pixel) when c is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?r=10');
    expect(res.status).toBe(200);
  });

  it('does NOT call CampaignRecipient.update when c is missing', async () => {
    const app = makeApp();
    await request(app).get('/track/open?r=10');
    await new Promise((r) => setImmediate(r));
    expect(mockCRUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 (pixel) when r is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?c=1');
    expect(res.status).toBe(200);
  });

  it('does NOT call CampaignRecipient.update when r is missing', async () => {
    const app = makeApp();
    await request(app).get('/track/open?c=1');
    await new Promise((r) => setImmediate(r));
    expect(mockCRUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 (pixel) when c is non-numeric string', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open?c=abc&r=10');
    expect(res.status).toBe(200);
  });

  it('does NOT call update when c is non-numeric', async () => {
    const app = makeApp();
    await request(app).get('/track/open?c=abc&r=10');
    await new Promise((r) => setImmediate(r));
    expect(mockCRUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 (pixel) when both params are absent', async () => {
    const app = makeApp();
    const res = await request(app).get('/track/open');
    expect(res.status).toBe(200);
  });
});

// ── DB error resilience ────────────────────────────────────────────────────────

describe('GET /track/open — DB error resilience', () => {
  it('still returns 200 (pixel) even if CampaignRecipient.update throws', async () => {
    mockCRUpdate.mockRejectedValue(new Error('DB connection lost'));
    const app = makeApp();

    // Response is sent before the async update, so status is always 200
    const res = await request(app).get('/track/open?c=1&r=2');
    expect(res.status).toBe(200);
  });

  it('still returns the correct GIF bytes when DB throws', async () => {
    mockCRUpdate.mockRejectedValue(new Error('timeout'));
    const app = makeApp();

    const res = await request(app)
      .get('/track/open?c=1&r=2')
      .buffer(true)
      .parse((res, fn) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });

    expect(res.body).toEqual(PIXEL);
  });
});
