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
    const { page, limit, status, search } = query;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = { createdBy };
    if (status) where['status'] = status;
    if (search) {
      where[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { subject: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows, count: total } = await Campaign.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']],
    });

    return {
      items: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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

  async countOpened(campaignId: number): Promise<number> {
    return CampaignRecipient.count({
      where: { campaignId, openedAt: { [Op.ne]: null } },
    });
  }
}
