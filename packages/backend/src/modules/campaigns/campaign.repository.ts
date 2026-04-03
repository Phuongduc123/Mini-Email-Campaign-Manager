import { Op } from 'sequelize';
import { Campaign } from '../../database/models/Campaign';
import { CampaignRecipient } from '../../database/models/CampaignRecipient';
import { Recipient } from '../../database/models/Recipient';
import { CampaignStatus, CursorPaginatedResult } from '../../shared/types';
import { CreateCampaignDto, ListCampaignQuery } from './campaign.schema';

function encodeCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64');
}

function decodeCursor(cursor: string): number {
  return parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10);
}

export class CampaignRepository {
  async findAll(
    createdBy: number,
    query: ListCampaignQuery,
  ): Promise<CursorPaginatedResult<Campaign>> {
    const { cursor, limit, status } = query;

    const where: Record<string, unknown> = { createdBy };
    if (status) where['status'] = status;
    if (cursor) where['id'] = { [Op.lt]: decodeCursor(cursor) };

    const rows = await Campaign.findAll({
      where,
      limit: limit + 1,
      order: [['id', 'DESC']],
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1].id) : null;

    return { items, nextCursor, hasMore };
  }

  async findById(id: number): Promise<Campaign | null> {
    return Campaign.findByPk(id, {
      include: [
        {
          model: CampaignRecipient,
          as: 'campaignRecipients',
          include: [{ model: Recipient, as: 'recipient' }],
        },
      ],
    });
  }

  async create(data: CreateCampaignDto & { createdBy: number }): Promise<Campaign> {
    const { recipientIds, ...campaignData } = data;
    const campaign = await Campaign.create(campaignData);

    const links = recipientIds.map((recipientId) => ({
      campaignId: campaign.id,
      recipientId,
      status: 'pending' as const,
      sentAt: null,
      openedAt: null,
      errorMessage: null,
      retryCount: 0,
    }));
    await CampaignRecipient.bulkCreate(links);

    return campaign;
  }

  async update(campaign: Campaign, data: Partial<Campaign>): Promise<Campaign> {
    return campaign.update(data);
  }

  async replaceRecipients(campaignId: number, recipientIds: number[]): Promise<void> {
    await CampaignRecipient.destroy({ where: { campaignId } });
    const links = recipientIds.map((recipientId) => ({
      campaignId,
      recipientId,
      status: 'pending' as const,
      sentAt: null,
      openedAt: null,
      errorMessage: null,
      retryCount: 0,
    }));
    await CampaignRecipient.bulkCreate(links);
  }

  async delete(campaign: Campaign): Promise<void> {
    await CampaignRecipient.destroy({ where: { campaignId: campaign.id } });
    await campaign.destroy();
  }

  async updateStatus(campaign: Campaign, status: CampaignStatus): Promise<Campaign> {
    return campaign.update({ status });
  }

  async countOpened(campaignId: number): Promise<number> {
    return CampaignRecipient.count({
      where: { campaignId, openedAt: { [Op.ne]: null } },
    });
  }
}
