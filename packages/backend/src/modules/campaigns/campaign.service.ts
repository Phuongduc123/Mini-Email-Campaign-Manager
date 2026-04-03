import { CampaignRepository } from './campaign.repository';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  ListCampaignQuery,
} from './campaign.schema';
import { Campaign } from '../../database/models/Campaign';
import { CampaignRecipient } from '../../database/models/CampaignRecipient';
import { CursorPaginatedResult } from '../../shared/types';
import { NotFoundError, ConflictError, ForbiddenError, BadRequestError } from '../../shared/utils/errors';
import { logger } from '../../config/logger';
import { getCampaignQueue } from '../../queue';

export class CampaignService {
  constructor(private readonly campaignRepository: CampaignRepository) {}

  async list(userId: number, query: ListCampaignQuery): Promise<CursorPaginatedResult<Campaign>> {
    return this.campaignRepository.findAll(userId, query);
  }

  async getById(id: number, userId: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.findById(id);
    if (!campaign) throw new NotFoundError('Campaign');
    if (campaign.createdBy !== userId) throw new ForbiddenError();
    return campaign;
  }

  async create(dto: CreateCampaignDto, userId: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.create({ ...dto, createdBy: userId });
    logger.info({ event: 'campaign.created', campaignId: campaign.id, userId }, 'Campaign created');
    return campaign;
  }

  async update(id: number, dto: UpdateCampaignDto, userId: number): Promise<Campaign> {
    const campaign = await this.getById(id, userId);

    if (campaign.status !== 'draft') {
      throw new ConflictError(
        'Campaign can only be edited while in draft status.',
        'CAMPAIGN_NOT_DRAFT',
      );
    }

    const { recipientIds, ...campaignFields } = dto;

    if (Object.keys(campaignFields).length > 0) {
      await this.campaignRepository.update(campaign, campaignFields as Partial<Campaign>);
    }

    if (recipientIds && recipientIds.length > 0) {
      await this.campaignRepository.replaceRecipients(id, recipientIds);
    }

    const updated = await this.campaignRepository.findById(id);
    logger.info({ event: 'campaign.updated', campaignId: id, userId }, 'Campaign updated');
    return updated!;
  }

  async delete(id: number, userId: number): Promise<void> {
    const campaign = await this.getById(id, userId);

    if (campaign.status !== 'draft') {
      throw new ConflictError(
        'Campaign can only be deleted while in draft status.',
        'CAMPAIGN_NOT_DRAFT',
      );
    }

    await this.campaignRepository.delete(campaign);
    logger.info({ event: 'campaign.deleted', campaignId: id, userId }, 'Campaign deleted');
  }

  async schedule(id: number, dto: ScheduleCampaignDto, userId: number): Promise<Campaign> {
    const campaign = await this.getById(id, userId);

    if (campaign.status !== 'draft') {
      throw new ConflictError(
        'Only draft campaigns can be scheduled.',
        'CAMPAIGN_NOT_DRAFT',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestError('scheduledAt must be a future timestamp.');
    }

    // Snapshot totalRecipients at schedule time
    const totalRecipients = await CampaignRecipient.count({ where: { campaignId: id } });
    await campaign.update({ status: 'scheduled', scheduledAt, totalRecipients });

    // Enqueue a BullMQ delayed job — fires automatically at scheduledAt
    const delay = scheduledAt.getTime() - Date.now();
    await getCampaignQueue().add(
      'send',
      { campaignId: id },
      {
        jobId: `campaign-${id}`,  // idempotent: second call won't create a duplicate
        delay,
      },
    );

    logger.info(
      { event: 'campaign.scheduled', campaignId: id, userId, scheduledAt, delay },
      'Campaign scheduled — delayed job enqueued',
    );
    return (await this.campaignRepository.findById(id))!;
  }

  async send(id: number, userId: number): Promise<Campaign> {
    const campaign = await this.getById(id, userId);

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new ConflictError(
        'Campaign can only be sent from draft or scheduled status.',
        'CAMPAIGN_NOT_SENDABLE',
      );
    }

    // Snapshot totalRecipients and flip status atomically before enqueuing
    const totalRecipients = await CampaignRecipient.count({ where: { campaignId: id } });
    await this.campaignRepository.updateStatus(campaign, 'sending');
    await Campaign.update({ totalRecipients }, { where: { id } });

    // Enqueue immediately — worker picks it up and does the actual send
    await getCampaignQueue().add(
      'send',
      { campaignId: id },
      {
        jobId: `campaign-${id}`,  // idempotent
      },
    );

    logger.info({ event: 'campaign.send.enqueued', campaignId: id, userId }, 'Campaign send job enqueued');

    return (await this.campaignRepository.findById(id))!;
  }

  async getStats(
    id: number,
    userId: number,
  ): Promise<{
    total: number;
    sent: number;
    failed: number;
    opened: number;
    open_rate: number;
    send_rate: number;
  }> {
    const campaign = await this.getById(id, userId); // ownership check + fetches counters

    // sentCount / failedCount / totalRecipients are denormalized — O(1) reads
    const total = campaign.totalRecipients;
    const sent = campaign.sentCount;
    const failed = campaign.failedCount;

    // opened still requires a live count (no denormalized column for opens yet)
    const opened = await this.campaignRepository.countOpened(id);

    const send_rate = total > 0 ? sent / total : 0;
    const open_rate = sent > 0 ? opened / sent : 0;

    return { total, sent, failed, opened, open_rate, send_rate };
  }
}
