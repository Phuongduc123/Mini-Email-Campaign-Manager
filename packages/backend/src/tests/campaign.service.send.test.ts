/**
 * Unit tests for CampaignService.send().
 * Covers the status guard, job enqueue, and cache update paths.
 */

import { CampaignService } from '../modules/campaigns/campaign.service';
import { CampaignRepository } from '../modules/campaigns/campaign.repository';
import { Campaign } from '../database/models/Campaign';

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock CampaignRecipient.count so send() can snapshot totalRecipients
jest.mock('../database/models/CampaignRecipient', () => ({
  CampaignRecipient: { count: jest.fn().mockResolvedValue(5) },
}));

// Mock Campaign.update (bulk update for totalRecipients)
jest.mock('../database/models/Campaign', () => ({
  Campaign: { update: jest.fn().mockResolvedValue([1]) },
}));

// Mock the BullMQ queue — factory uses no outer references (avoids TDZ with hoisting)
jest.mock('../queue');
import { getCampaignQueue } from '../queue';
let mockAdd: jest.Mock;

// Mock send.service (not exercised in these tests but imported transitively)
jest.mock('../modules/campaigns/send.service', () => ({
  executeSend: jest.fn().mockResolvedValue(undefined),
}));

// ── Factory helpers ────────────────────────────────────────────────────────────

function makeMockCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: 'Weekly Newsletter',
    subject: 'This week in tech',
    body: 'Hello world',
    status: 'draft',
    scheduledAt: null,
    createdBy: 42,
    totalRecipients: 0,
    sentCount: 0,
    failedCount: 0,
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

function makeRepo(campaignStatus: Campaign['status'] = 'draft'): jest.Mocked<CampaignRepository> {
  const campaign = makeMockCampaign({ status: campaignStatus });
  return {
    findAll: jest.fn(),
    findById: jest.fn().mockResolvedValue(campaign),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    replaceRecipients: jest.fn(),
    updateStatus: jest.fn().mockImplementation((_c: Campaign, status: string) => {
      campaign.status = status as Campaign['status'];
      return Promise.resolve(campaign);
    }),
    countOpened: jest.fn().mockResolvedValue(0),
    getStats: jest.fn(),
  } as unknown as jest.Mocked<CampaignRepository>;
}

const USER_ID = 42;
const CAMPAIGN_ID = 1;

beforeEach(() => {
  mockAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
  (getCampaignQueue as jest.Mock).mockReturnValue({ add: mockAdd });
});

// ── Status guard ───────────────────────────────────────────────────────────────

describe('CampaignService.send() — status guard', () => {
  it('throws CAMPAIGN_NOT_SENDABLE when campaign is already sending', async () => {
    const repo = makeRepo('sending');
    const service = new CampaignService(repo);

    await expect(service.send(CAMPAIGN_ID, USER_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_SENDABLE',
      statusCode: 409,
    });
  });

  it('throws CAMPAIGN_NOT_SENDABLE when campaign is already sent', async () => {
    const repo = makeRepo('sent');
    const service = new CampaignService(repo);

    await expect(service.send(CAMPAIGN_ID, USER_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_SENDABLE',
      statusCode: 409,
    });
  });

  it('does not enqueue a job when status guard rejects', async () => {
    const repo = makeRepo('sending');
    const service = new CampaignService(repo);

    await service.send(CAMPAIGN_ID, USER_ID).catch(() => {});

    expect(mockAdd).not.toHaveBeenCalled();
  });
});

// ── Happy paths ────────────────────────────────────────────────────────────────

describe('CampaignService.send() — allowed transitions', () => {
  it('succeeds and enqueues a job when campaign is draft', async () => {
    const repo = makeRepo('draft');
    const service = new CampaignService(repo);

    const result = await service.send(CAMPAIGN_ID, USER_ID);

    expect(result).toBeDefined();
    expect(mockAdd).toHaveBeenCalledWith(
      'send',
      { campaignId: CAMPAIGN_ID },
      expect.objectContaining({ jobId: `campaign-${CAMPAIGN_ID}` }),
    );
  });

  it('succeeds and enqueues a job when campaign is scheduled', async () => {
    const repo = makeRepo('scheduled');
    const service = new CampaignService(repo);

    const result = await service.send(CAMPAIGN_ID, USER_ID);

    expect(result).toBeDefined();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('flips campaign status to sending before enqueuing', async () => {
    const repo = makeRepo('draft');
    const service = new CampaignService(repo);

    await service.send(CAMPAIGN_ID, USER_ID);

    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: CAMPAIGN_ID }),
      'sending',
    );
    // updateStatus is called before add
    const statusOrder = repo.updateStatus.mock.invocationCallOrder[0];
    const addOrder = mockAdd.mock.invocationCallOrder[0];
    expect(statusOrder).toBeLessThan(addOrder);
  });

  it('uses an idempotent jobId so double-send does not create duplicate jobs', async () => {
    const repo = makeRepo('draft');
    const service = new CampaignService(repo);

    await service.send(CAMPAIGN_ID, USER_ID);

    const [, , options] = mockAdd.mock.calls[0];
    expect(options.jobId).toBe(`campaign-${CAMPAIGN_ID}`);
  });
});

// ── Ownership guard ────────────────────────────────────────────────────────────

describe('CampaignService.send() — ownership', () => {
  it('throws ForbiddenError when userId does not match campaign.createdBy', async () => {
    const repo = makeRepo('draft');
    const service = new CampaignService(repo);

    const WRONG_USER = 999;
    await expect(service.send(CAMPAIGN_ID, WRONG_USER)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
