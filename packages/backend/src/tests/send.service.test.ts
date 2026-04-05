/**
 * Unit tests for send.service.ts — executeSend()
 *
 * Covers:
 *  - Single batch (< BATCH_SIZE) with all-succeed / all-fail scenarios
 *  - Multi-batch loop: verifies findAll is called repeatedly until empty
 *  - Large volume: 1 000 recipients processed across 5 batches of 200
 *  - Unsubscribed recipients: pending rows remaining after main loop marked failed
 *  - Campaign set to status='sent' after all batches complete
 *  - Crash recovery: if a DB update throws, executeSend re-throws so the worker
 *    can handle retries (campaign stays in 'sending' — intentionally not reset here)
 */

import { executeSend } from '../modules/campaigns/send.service';

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock the Recipient model (used only as an include target in findAll)
jest.mock('../database/models/Recipient', () => ({ Recipient: {} }));

// ── Model mocks ────────────────────────────────────────────────────────────────

const mockCRFindAll = jest.fn();
const mockCRUpdate = jest.fn().mockResolvedValue([0]);
const mockCRCount = jest.fn().mockResolvedValue(0);

jest.mock('../database/models/CampaignRecipient', () => ({
  CampaignRecipient: {
    findAll: (...args: unknown[]) => mockCRFindAll(...args),
    update: (...args: unknown[]) => mockCRUpdate(...args),
    count: (...args: unknown[]) => mockCRCount(...args),
  },
}));

const mockCampaignUpdate = jest.fn().mockResolvedValue([1]);

jest.mock('../database/models/Campaign', () => ({
  Campaign: {
    update: (...args: unknown[]) => mockCampaignUpdate(...args),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build fake CampaignRecipient rows returned by findAll */
function makeRows(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    recipientId: startId + i,
    campaignId: 1,
  }));
}

const CAMPAIGN_ID = 7;

beforeEach(() => {
  jest.clearAllMocks();
  mockCRUpdate.mockResolvedValue([0]);
  mockCampaignUpdate.mockResolvedValue([1]);
  mockCRCount.mockResolvedValue(0);
});

// ── Single batch — all recipients succeed ─────────────────────────────────────

describe('executeSend() — single batch, all succeed', () => {
  beforeEach(() => {
    // findAll: 5 pending rows, then empty to stop loop, then 0 skipped unsubscribed
    mockCRFindAll
      .mockResolvedValueOnce(makeRows(5))
      .mockResolvedValueOnce([]);
    mockCRCount.mockResolvedValue(0);

    // Force all Math.random() calls to return 1 → all succeed (1 > FAILURE_RATE 0.2)
    jest.spyOn(Math, 'random').mockReturnValue(1);
  });

  afterEach(() => {
    jest.spyOn(Math, 'random').mockRestore();
  });

  it('calls findAll until it returns an empty batch', async () => {
    await executeSend(CAMPAIGN_ID);
    expect(mockCRFindAll).toHaveBeenCalledTimes(2);
  });

  it('updates sent rows with status=sent', async () => {
    await executeSend(CAMPAIGN_ID);

    const sentCall = mockCRUpdate.mock.calls.find(
      ([data]: [{ status?: string }]) => data.status === 'sent',
    );
    expect(sentCall).toBeDefined();
    expect(sentCall![0]).toMatchObject({ status: 'sent' });
  });

  it('does not update any per-batch failed rows (only unsubscribed cleanup runs)', async () => {
    await executeSend(CAMPAIGN_ID);

    // Per-batch failures have errorMessage = 'Simulated SMTP delivery failure.'
    // Unsubscribed cleanup has errorMessage = 'Recipient is unsubscribed.'
    // When all succeed, only the cleanup call should exist, not the per-batch one.
    const smtpFailCall = mockCRUpdate.mock.calls.find(
      ([data]: [{ errorMessage?: string }]) =>
        data.errorMessage === 'Simulated SMTP delivery failure.',
    );
    expect(smtpFailCall).toBeUndefined();
  });

  it('sets campaign status to sent', async () => {
    await executeSend(CAMPAIGN_ID);
    expect(mockCampaignUpdate).toHaveBeenCalledWith(
      { status: 'sent' },
      expect.objectContaining({ where: { id: CAMPAIGN_ID } }),
    );
  });
});

// ── Single batch — all recipients fail ────────────────────────────────────────

describe('executeSend() — single batch, all fail', () => {
  beforeEach(() => {
    mockCRFindAll
      .mockResolvedValueOnce(makeRows(5))
      .mockResolvedValueOnce([]);
    mockCRCount.mockResolvedValue(0);

    // Force all Math.random() calls to return 0 → all fail (0 > 0.2 is false)
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.spyOn(Math, 'random').mockRestore();
  });

  it('updates failed rows with status=failed', async () => {
    await executeSend(CAMPAIGN_ID);

    const failedCalls = mockCRUpdate.mock.calls.filter(
      ([data]: [{ status?: string }]) => data.status === 'failed',
    );
    expect(failedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('still sets campaign to sent even when all deliveries fail', async () => {
    await executeSend(CAMPAIGN_ID);
    expect(mockCampaignUpdate).toHaveBeenCalledWith(
      { status: 'sent' },
      expect.anything(),
    );
  });
});

// ── Multi-batch loop ───────────────────────────────────────────────────────────

describe('executeSend() — multi-batch processing', () => {
  it('loops until findAll returns empty — 3 batches (200 + 150 + 0)', async () => {
    mockCRFindAll
      .mockResolvedValueOnce(makeRows(200))       // batch 1
      .mockResolvedValueOnce(makeRows(150, 201))  // batch 2
      .mockResolvedValueOnce([]);                 // stop
    mockCRCount.mockResolvedValue(0);
    jest.spyOn(Math, 'random').mockReturnValue(1);

    await executeSend(CAMPAIGN_ID);

    // 3 calls to findAll (2 non-empty + 1 empty)
    expect(mockCRFindAll).toHaveBeenCalledTimes(3);

    jest.spyOn(Math, 'random').mockRestore();
  });

  it('processes each batch independently — update called once per non-empty batch', async () => {
    mockCRFindAll
      .mockResolvedValueOnce(makeRows(200))
      .mockResolvedValueOnce(makeRows(100, 201))
      .mockResolvedValueOnce([]);
    mockCRCount.mockResolvedValue(0);
    jest.spyOn(Math, 'random').mockReturnValue(1); // all succeed

    await executeSend(CAMPAIGN_ID);

    // One sent-update call per batch (2 batches) + one unsubscribed cleanup call
    const sentUpdateCalls = mockCRUpdate.mock.calls.filter(
      ([data]: [{ status?: string }]) => data.status === 'sent',
    );
    expect(sentUpdateCalls).toHaveLength(2);

    jest.spyOn(Math, 'random').mockRestore();
  });
});

// ── Large volume: 1 000 recipients across 5 batches of 200 ────────────────────

describe('executeSend() — large volume (1 000 recipients)', () => {
  it('completes all 5 batches and marks campaign sent', async () => {
    // 5 full batches + 1 empty terminator
    mockCRFindAll
      .mockResolvedValueOnce(makeRows(200, 1))
      .mockResolvedValueOnce(makeRows(200, 201))
      .mockResolvedValueOnce(makeRows(200, 401))
      .mockResolvedValueOnce(makeRows(200, 601))
      .mockResolvedValueOnce(makeRows(200, 801))
      .mockResolvedValueOnce([]);
    mockCRCount.mockResolvedValue(0);
    jest.spyOn(Math, 'random').mockReturnValue(1); // all succeed

    await executeSend(CAMPAIGN_ID);

    expect(mockCRFindAll).toHaveBeenCalledTimes(6);

    const sentCalls = mockCRUpdate.mock.calls.filter(
      ([data]: [{ status?: string }]) => data.status === 'sent',
    );
    expect(sentCalls).toHaveLength(5); // one update per batch

    expect(mockCampaignUpdate).toHaveBeenCalledWith(
      { status: 'sent' },
      expect.objectContaining({ where: { id: CAMPAIGN_ID } }),
    );

    jest.spyOn(Math, 'random').mockRestore();
  });

  it('records correct recipient IDs in each batch update', async () => {
    const batch1 = makeRows(3, 1); // recipientIds: [1, 2, 3]
    const batch2 = makeRows(2, 4); // recipientIds: [4, 5]
    mockCRFindAll
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);
    mockCRCount.mockResolvedValue(0);
    jest.spyOn(Math, 'random').mockReturnValue(1);

    await executeSend(CAMPAIGN_ID);

    const sentCalls = mockCRUpdate.mock.calls.filter(
      ([data]: [{ status?: string }]) => data.status === 'sent',
    );

    // Op.in is a Symbol — extract via getOwnPropertySymbols
    const allUpdatedIds = sentCalls.flatMap(
      ([, opts]: [unknown, { where: { recipientId: Record<symbol, number[]> } }]) => {
        const rid = opts.where.recipientId;
        const sym = Object.getOwnPropertySymbols(rid)[0];
        return sym ? rid[sym] : [];
      },
    );
    expect(allUpdatedIds).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));

    jest.spyOn(Math, 'random').mockRestore();
  });
});

// ── Unsubscribed recipients ────────────────────────────────────────────────────

describe('executeSend() — unsubscribed recipients cleanup', () => {
  it('marks remaining pending rows (unsubscribed) as failed after main loop', async () => {
    // Main loop finds nothing (all were excluded by the inner join in findAll)
    mockCRFindAll.mockResolvedValue([]);
    mockCRCount.mockResolvedValue(3); // 3 pending rows remain after loop

    await executeSend(CAMPAIGN_ID);

    const unsubCall = mockCRUpdate.mock.calls.find(
      ([data, opts]: [{ status?: string; errorMessage?: string }, { where?: { status?: string } }]) =>
        data.status === 'failed' &&
        data.errorMessage?.includes('unsubscribed') &&
        opts?.where?.status === 'pending',
    );
    expect(unsubCall).toBeDefined();
  });
});

// ── Crash recovery ─────────────────────────────────────────────────────────────

describe('executeSend() — crash recovery', () => {
  it('re-throws when a DB update fails so the worker can retry', async () => {
    mockCRFindAll.mockResolvedValueOnce(makeRows(5)).mockResolvedValue([]);
    jest.spyOn(Math, 'random').mockReturnValue(1);

    mockCRUpdate.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(executeSend(CAMPAIGN_ID)).rejects.toThrow('DB connection lost');

    // Campaign.update({status:'sent'}) must NOT have been called — stays in 'sending'
    const sentCall = mockCampaignUpdate.mock.calls.find(
      ([data]: [{ status?: string }]) => data.status === 'sent',
    );
    expect(sentCall).toBeUndefined();

    jest.spyOn(Math, 'random').mockRestore();
  });

  it('re-throws when findAll itself fails', async () => {
    mockCRFindAll.mockRejectedValue(new Error('Query timeout'));

    await expect(executeSend(CAMPAIGN_ID)).rejects.toThrow('Query timeout');
  });
});
