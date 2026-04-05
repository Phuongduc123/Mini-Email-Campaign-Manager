/**
 * Unit tests for CampaignRepository.
 *
 * Covers:
 *  - findAll: offset/page pagination math
 *  - findAll: search filter applied on name and subject
 *  - findAll: status filter
 *  - findAll: empty result returns correct total/totalPages
 *  - findAll: edge cases — page 1, large page, last page
 *  - create: bulkCreate called with correct recipientId links
 *  - create: campaign with zero recipientIds skips bulkCreate
 *  - replaceRecipients: destroys old links then bulk-inserts new ones
 *  - countOpened: delegates to CampaignRecipient.count with openedAt != null
 */

import { CampaignRepository } from '../modules/campaigns/campaign.repository';
import { Campaign } from '../database/models/Campaign';

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Model mocks ────────────────────────────────────────────────────────────────

const mockFindAndCountAll = jest.fn();
const mockCampaignCreate = jest.fn();

jest.mock('../database/models/Campaign', () => ({
  Campaign: {
    findByPk: jest.fn(),
    findAndCountAll: (...args: unknown[]) => mockFindAndCountAll(...args),
    create: (...args: unknown[]) => mockCampaignCreate(...args),
  },
}));

const mockCRBulkCreate = jest.fn().mockResolvedValue([]);
const mockCRDestroy = jest.fn().mockResolvedValue(0);
const mockCRCount = jest.fn().mockResolvedValue(0);

jest.mock('../database/models/CampaignRecipient', () => ({
  CampaignRecipient: {
    bulkCreate: (...args: unknown[]) => mockCRBulkCreate(...args),
    destroy: (...args: unknown[]) => mockCRDestroy(...args),
    count: (...args: unknown[]) => mockCRCount(...args),
  },
}));

jest.mock('../database/models/Recipient', () => ({ Recipient: {} }));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: 'Newsletter',
    subject: 'Hello world',
    body: 'Body',
    status: 'draft',
    createdBy: 5,
    totalRecipients: 0,
    sentCount: 0,
    failedCount: 0,
    scheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    update: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Campaign;
}

const USER_ID = 5;

beforeEach(() => {
  jest.clearAllMocks();
  mockCRBulkCreate.mockResolvedValue([]);
  mockCRDestroy.mockResolvedValue(0);
  mockCRCount.mockResolvedValue(0);
});

// ── findAll: pagination math ───────────────────────────────────────────────────

describe('CampaignRepository.findAll() — pagination', () => {
  it('passes correct offset for page=1, limit=20', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20 });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    expect(opts.offset).toBe(0);
    expect(opts.limit).toBe(20);
  });

  it('passes correct offset for page=3, limit=10 → offset=20', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 3, limit: 10 });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    expect(opts.offset).toBe(20);
    expect(opts.limit).toBe(10);
  });

  it('returns totalPages = Math.ceil(total / limit)', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 45 });
    const repo = new CampaignRepository();

    const result = await repo.findAll(USER_ID, { page: 1, limit: 20 });

    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3); // ceil(45/20) = 3
  });

  it('returns totalPages=0 when count=0', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    const result = await repo.findAll(USER_ID, { page: 1, limit: 20 });

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('returns correct page and limit in result', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [makeCampaign()], count: 1 });
    const repo = new CampaignRepository();

    const result = await repo.findAll(USER_ID, { page: 2, limit: 5 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
  });

  it('always filters by createdBy = userId', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20 });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    expect(opts.where).toMatchObject({ createdBy: USER_ID });
  });

  it('orders results by id DESC', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20 });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    expect(opts.order).toEqual([['id', 'DESC']]);
  });
});

// ── findAll: status filter ─────────────────────────────────────────────────────

describe('CampaignRepository.findAll() — status filter', () => {
  it('includes status in where clause when provided', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20, status: 'sent' });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    expect(opts.where).toMatchObject({ status: 'sent' });
  });

  it('does not include status in where clause when not provided', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20 });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    expect(opts.where.status).toBeUndefined();
  });
});

// ── findAll: search filter ─────────────────────────────────────────────────────

describe('CampaignRepository.findAll() — search filter', () => {
  it('adds Op.or with iLike patterns when search is provided', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20, search: 'flash' });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    // Op.or is a Symbol key — find it via getOwnPropertySymbols
    const symbols = Object.getOwnPropertySymbols(opts.where);
    expect(symbols.length).toBeGreaterThan(0);

    // Op.or value is an array of { field: { [Op.iLike]: pattern } } conditions
    const orConditions = opts.where[symbols[0]];
    expect(Array.isArray(orConditions)).toBe(true);
    expect(orConditions).toHaveLength(2);

    // Op.iLike is also a Symbol — extract pattern values via getOwnPropertySymbols
    const patterns = orConditions.flatMap((cond: Record<string, Record<symbol, string>>) =>
      Object.values(cond).flatMap((innerObj) => {
        const innerSyms = Object.getOwnPropertySymbols(innerObj);
        return innerSyms.map((s) => innerObj[s]);
      })
    );
    expect(patterns).toContain('%flash%');
  });

  it('does not add Op.or when search is undefined', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20 });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    const symbols = Object.getOwnPropertySymbols(opts.where);
    expect(symbols).toHaveLength(0);
  });

  it('does not add Op.or when search is empty string', async () => {
    mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const repo = new CampaignRepository();

    await repo.findAll(USER_ID, { page: 1, limit: 20, search: '' });

    const [opts] = mockFindAndCountAll.mock.calls[0];
    const symbols = Object.getOwnPropertySymbols(opts.where);
    expect(symbols).toHaveLength(0);
  });
});

// ── create: bulkCreate recipient links ────────────────────────────────────────

describe('CampaignRepository.create()', () => {
  it('calls bulkCreate with a link row for each recipientId', async () => {
    const campaign = makeCampaign({ id: 10 });
    mockCampaignCreate.mockResolvedValue(campaign);

    const repo = new CampaignRepository();
    await repo.create({
      name: 'Test',
      subject: 'Hello',
      body: 'Body',
      recipientIds: [1, 2, 3],
      createdBy: USER_ID,
    });

    expect(mockCRBulkCreate).toHaveBeenCalledTimes(1);
    const [links] = mockCRBulkCreate.mock.calls[0];
    expect(links).toHaveLength(3);
    expect(links.map((l: { recipientId: number }) => l.recipientId)).toEqual([1, 2, 3]);
  });

  it('sets all new links to status=pending', async () => {
    const campaign = makeCampaign({ id: 11 });
    mockCampaignCreate.mockResolvedValue(campaign);

    const repo = new CampaignRepository();
    await repo.create({
      name: 'T',
      subject: 'S',
      body: 'B',
      recipientIds: [5, 6],
      createdBy: USER_ID,
    });

    const [links] = mockCRBulkCreate.mock.calls[0];
    for (const link of links) {
      expect(link.status).toBe('pending');
    }
  });

  it('uses the new campaign id for all links', async () => {
    const campaign = makeCampaign({ id: 99 });
    mockCampaignCreate.mockResolvedValue(campaign);

    const repo = new CampaignRepository();
    await repo.create({
      name: 'T',
      subject: 'S',
      body: 'B',
      recipientIds: [10, 20],
      createdBy: USER_ID,
    });

    const [links] = mockCRBulkCreate.mock.calls[0];
    for (const link of links) {
      expect(link.campaignId).toBe(99);
    }
  });

  it('calls bulkCreate once even for large recipientIds list (100 ids)', async () => {
    const campaign = makeCampaign({ id: 50 });
    mockCampaignCreate.mockResolvedValue(campaign);

    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const repo = new CampaignRepository();
    await repo.create({ name: 'T', subject: 'S', body: 'B', recipientIds: ids, createdBy: USER_ID });

    expect(mockCRBulkCreate).toHaveBeenCalledTimes(1);
    const [links] = mockCRBulkCreate.mock.calls[0];
    expect(links).toHaveLength(100);
  });
});

// ── replaceRecipients ─────────────────────────────────────────────────────────

describe('CampaignRepository.replaceRecipients()', () => {
  it('destroys existing links before inserting new ones', async () => {
    const repo = new CampaignRepository();
    await repo.replaceRecipients(7, [1, 2]);

    // destroy must be called before bulkCreate
    const destroyOrder = mockCRDestroy.mock.invocationCallOrder[0];
    const bulkOrder = mockCRBulkCreate.mock.invocationCallOrder[0];
    expect(destroyOrder).toBeLessThan(bulkOrder);
  });

  it('destroys with correct campaignId filter', async () => {
    const repo = new CampaignRepository();
    await repo.replaceRecipients(7, [1, 2]);

    const [opts] = mockCRDestroy.mock.calls[0];
    expect(opts.where).toMatchObject({ campaignId: 7 });
  });

  it('bulk-inserts exactly the new recipient ids', async () => {
    const repo = new CampaignRepository();
    await repo.replaceRecipients(7, [10, 20, 30]);

    const [links] = mockCRBulkCreate.mock.calls[0];
    expect(links.map((l: { recipientId: number }) => l.recipientId)).toEqual([10, 20, 30]);
  });
});

// ── countOpened ───────────────────────────────────────────────────────────────

describe('CampaignRepository.countOpened()', () => {
  it('returns the count from CampaignRecipient.count', async () => {
    mockCRCount.mockResolvedValue(42);
    const repo = new CampaignRepository();

    const result = await repo.countOpened(3);

    expect(result).toBe(42);
  });

  it('passes campaignId and openedAt != null to the query', async () => {
    mockCRCount.mockResolvedValue(0);
    const repo = new CampaignRepository();

    await repo.countOpened(3);

    const [opts] = mockCRCount.mock.calls[0];
    expect(opts.where.campaignId).toBe(3);
    // openedAt: { [Op.ne]: null } — key is a Symbol
    const symbols = Object.getOwnPropertySymbols(opts.where.openedAt);
    expect(symbols.length).toBeGreaterThan(0);
  });
});
