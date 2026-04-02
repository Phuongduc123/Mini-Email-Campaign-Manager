/**
 * Unit tests for CampaignService business rules.
 * All DB calls are mocked — no database connection required.
 */

import { CampaignService } from '../modules/campaigns/campaign.service';
import { CampaignRepository } from '../modules/campaigns/campaign.repository';
import { Campaign } from '../database/models/Campaign';
import { ConflictError, BadRequestError } from '../shared/utils/errors';

// Silence logger output during tests
jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock dynamic import for send.service to avoid actual DB calls
jest.mock('../modules/campaigns/send.service', () => ({
  executeSend: jest.fn().mockResolvedValue(undefined),
}));

function makeMockCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: 'Test Campaign',
    subject: 'Hello',
    body: 'Body',
    status: 'draft',
    scheduledAt: null,
    createdBy: 42,
    createdAt: new Date(),
    updatedAt: new Date(),
    update: jest.fn().mockImplementation(function (this: Campaign, data: Partial<Campaign>) {
      Object.assign(this, data);
      return Promise.resolve(this);
    }),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Campaign;
}

function makeRepo(campaignOverrides: Partial<Campaign> = {}): jest.Mocked<CampaignRepository> {
  const campaign = makeMockCampaign(campaignOverrides);
  return {
    findAll: jest.fn(),
    findById: jest.fn().mockResolvedValue(campaign),
    create: jest.fn().mockResolvedValue(campaign),
    update: jest.fn().mockResolvedValue(campaign),
    delete: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockImplementation((_c: Campaign, status: string) => {
      campaign.status = status as Campaign['status'];
      return Promise.resolve(campaign);
    }),
    getStats: jest.fn(),
  } as unknown as jest.Mocked<CampaignRepository>;
}

const USER_ID = 42;
const CAMPAIGN_ID = 1;

// ─── Test 1: Cannot PATCH a non-draft campaign ───────────────────────────────
describe('CampaignService.update()', () => {
  it('throws CAMPAIGN_NOT_DRAFT when campaign is scheduled', async () => {
    const repo = makeRepo({ status: 'scheduled' });
    const service = new CampaignService(repo);

    await expect(
      service.update(CAMPAIGN_ID, { name: 'New Name' }, USER_ID),
    ).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
      statusCode: 409,
    });
  });

  it('throws CAMPAIGN_NOT_DRAFT when campaign is sent', async () => {
    const repo = makeRepo({ status: 'sent' });
    const service = new CampaignService(repo);

    await expect(
      service.update(CAMPAIGN_ID, { name: 'New Name' }, USER_ID),
    ).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
      statusCode: 409,
    });
  });

  it('succeeds when campaign is draft', async () => {
    const repo = makeRepo({ status: 'draft' });
    const service = new CampaignService(repo);

    await expect(
      service.update(CAMPAIGN_ID, { name: 'New Name' }, USER_ID),
    ).resolves.toBeDefined();
  });
});

// ─── Test 2: Cannot DELETE a non-draft campaign ──────────────────────────────
describe('CampaignService.delete()', () => {
  it('throws CAMPAIGN_NOT_DRAFT when campaign is sending', async () => {
    const repo = makeRepo({ status: 'sending' });
    const service = new CampaignService(repo);

    await expect(service.delete(CAMPAIGN_ID, USER_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
      statusCode: 409,
    });
  });

  it('succeeds when campaign is draft', async () => {
    const repo = makeRepo({ status: 'draft' });
    const service = new CampaignService(repo);

    await expect(service.delete(CAMPAIGN_ID, USER_ID)).resolves.toBeUndefined();
  });
});

// ─── Test 3: scheduledAt must be a future timestamp ──────────────────────────
describe('CampaignService.schedule()', () => {
  it('throws BadRequestError when scheduledAt is in the past', async () => {
    const repo = makeRepo({ status: 'draft' });
    const service = new CampaignService(repo);

    const pastDate = new Date(Date.now() - 60_000).toISOString();

    await expect(
      service.schedule(CAMPAIGN_ID, { scheduledAt: pastDate }, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when scheduledAt is now (not future)', async () => {
    const repo = makeRepo({ status: 'draft' });
    const service = new CampaignService(repo);

    // Slightly in the past to account for execution time
    const now = new Date(Date.now() - 1).toISOString();

    await expect(
      service.schedule(CAMPAIGN_ID, { scheduledAt: now }, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws CAMPAIGN_NOT_DRAFT when campaign is already scheduled', async () => {
    const repo = makeRepo({ status: 'scheduled' });
    const service = new CampaignService(repo);

    const futureDate = new Date(Date.now() + 60_000).toISOString();

    await expect(
      service.schedule(CAMPAIGN_ID, { scheduledAt: futureDate }, USER_ID),
    ).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
    });
  });

  it('succeeds with a valid future date on a draft campaign', async () => {
    const repo = makeRepo({ status: 'draft' });
    const service = new CampaignService(repo);

    const futureDate = new Date(Date.now() + 60_000).toISOString();

    await expect(
      service.schedule(CAMPAIGN_ID, { scheduledAt: futureDate }, USER_ID),
    ).resolves.toBeDefined();
  });
});

// ─── Bonus Test 4: Stats open_rate and send_rate calculation ─────────────────
describe('CampaignService.getStats()', () => {
  it('returns 0 rates when total is 0', async () => {
    const repo = makeRepo({ status: 'sent' });
    repo.getStats.mockResolvedValue({
      total: 0, sent: 0, failed: 0, opened: 0, open_rate: 0, send_rate: 0,
    });
    const service = new CampaignService(repo);

    const stats = await service.getStats(CAMPAIGN_ID, USER_ID);
    expect(stats.open_rate).toBe(0);
    expect(stats.send_rate).toBe(0);
  });

  it('calculates correct rates', async () => {
    const repo = makeRepo({ status: 'sent' });
    repo.getStats.mockResolvedValue({
      total: 100, sent: 80, failed: 20, opened: 40,
      open_rate: 40 / 80,
      send_rate: 80 / 100,
    });
    const service = new CampaignService(repo);

    const stats = await service.getStats(CAMPAIGN_ID, USER_ID);
    expect(stats.send_rate).toBeCloseTo(0.8);
    expect(stats.open_rate).toBeCloseTo(0.5);
  });
});
