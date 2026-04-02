import { CampaignRepository } from './campaign.repository';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  ListCampaignQuery,
} from './campaign.schema';
import { Campaign } from '../../database/models/Campaign';
import { PaginatedResult } from '../../shared/types';
import { NotFoundError, ConflictError, ForbiddenError, BadRequestError } from '../../shared/utils/errors';
import { logger } from '../../config/logger';

export class CampaignService {
  constructor(private readonly campaignRepository: CampaignRepository) {}

  async list(userId: number, query: ListCampaignQuery): Promise<PaginatedResult<Campaign>> {
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

    const updated = await this.campaignRepository.update(campaign, dto as Partial<Campaign>);
    logger.info({ event: 'campaign.updated', campaignId: id, userId }, 'Campaign updated');
    return updated;
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

    const updated = await campaign.update({ status: 'scheduled', scheduledAt });
    logger.info(
      { event: 'campaign.scheduled', campaignId: id, userId, scheduledAt },
      'Campaign scheduled',
    );
    return updated;
  }

  async send(id: number, userId: number): Promise<void> {
    // Imported here to avoid circular deps at module load time
    const { executeSend } = await import('./send.service');

    const campaign = await this.getById(id, userId);

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new ConflictError(
        'Campaign can only be sent from draft or scheduled status.',
        'CAMPAIGN_NOT_SENDABLE',
      );
    }

    await this.campaignRepository.updateStatus(campaign, 'sending');
    logger.info({ event: 'campaign.send.started', campaignId: id, userId }, 'Campaign send initiated');

    // Fire and forget — do NOT await. Return 202 immediately.
    setImmediate(() => {
      executeSend(id).catch((err: Error) => {
        logger.error(
          { event: 'campaign.send.error', campaignId: id, err: err.message },
          'Campaign send failed unexpectedly',
        );
      });
    });
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
    await this.getById(id, userId); // ownership check
    return this.campaignRepository.getStats(id);
  }
}
