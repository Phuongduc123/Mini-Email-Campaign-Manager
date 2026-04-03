import { Op } from 'sequelize';
import { Campaign } from '../../database/models/Campaign';
import { CampaignRecipient } from '../../database/models/CampaignRecipient';
import { Recipient } from '../../database/models/Recipient';
import { CampaignStatus, PaginatedResult } from '../../shared/types';
import { CreateCampaignDto, ListCampaignQuery } from './campaign.schema';

export class CampaignRepository {
  async findAll(
    createdBy: number,
    query: ListCampaignQuery,
  ): Promise<PaginatedResult<Campaign>> {
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = { createdBy };
    if (status) where['status'] = status;

    const { count, rows } = await Campaign.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return {
      items: rows,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
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

  async getStats(campaignId: number): Promise<{
    total: number;
    sent: number;
    failed: number;
    opened: number;
    open_rate: number;
    send_rate: number;
  }> {
    const [total, sent, failed, opened] = await Promise.all([
      CampaignRecipient.count({ where: { campaignId } }),
      CampaignRecipient.count({ where: { campaignId, status: 'sent' } }),
      CampaignRecipient.count({ where: { campaignId, status: 'failed' } }),
      CampaignRecipient.count({
        where: { campaignId, openedAt: { [Op.ne]: null } },
      }),
    ]);

    const send_rate = total > 0 ? sent / total : 0;
    const open_rate = sent > 0 ? opened / sent : 0;

    return { total, sent, failed, opened, open_rate, send_rate };
  }
}
