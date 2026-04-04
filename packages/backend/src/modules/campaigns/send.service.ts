import { Op } from 'sequelize';
import { Campaign } from '../../database/models/Campaign';
import { CampaignRecipient } from '../../database/models/CampaignRecipient';
import { Recipient } from '../../database/models/Recipient';
import { logger } from '../../config/logger';

const BATCH_SIZE = 200;
const FAILURE_RATE = 0.2; // 20% simulated failure rate

/**
 * Async send simulation.
 * Called fire-and-forget from CampaignService.send() — must never throw uncaught.
 *
 * Flow:
 *   1. Fetch pending recipients in batches of BATCH_SIZE
 *   2. Simulate send (random sent/failed split)
 *   3. Batch UPDATE status + sentAt / errorMessage
 *   4. Repeat until no pending rows remain
 *   5. Set campaign.status = 'sent'
 */
export async function executeSend(campaignId: number): Promise<void> {
  const startedAt = Date.now();
  let totalSent = 0;
  let totalFailed = 0;

  logger.info({ event: 'campaign.send.executing', campaignId }, 'Send execution started');

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Fetch next batch of pending rows, skipping unsubscribed recipients
      const batch = await CampaignRecipient.findAll({
        where: { campaignId, status: 'pending' },
        include: [
          {
            model: Recipient,
            as: 'recipient',
            where: { unsubscribedAt: { [Op.is]: null } },
            required: true,
          },
        ],
        limit: BATCH_SIZE,
      });

      if (batch.length === 0) break;

      const sentIds: number[] = [];
      const failedItems: Array<{ recipientId: number; errorMessage: string }> = [];

      for (const cr of batch) {
        if (Math.random() > FAILURE_RATE) {
          sentIds.push(cr.recipientId);
        } else {
          failedItems.push({
            recipientId: cr.recipientId,
            errorMessage: 'Simulated SMTP delivery failure.',
          });
        }
      }

      const now = new Date();

      // Batch update sent rows
      if (sentIds.length > 0) {
        await CampaignRecipient.update(
          { status: 'sent', sentAt: now },
          { where: { campaignId, recipientId: { [Op.in]: sentIds } } },
        );
        totalSent += sentIds.length;
      }

      // Batch update failed rows
      if (failedItems.length > 0) {
        await CampaignRecipient.update(
          { status: 'failed', errorMessage: 'Simulated SMTP delivery failure.' },
          {
            where: {
              campaignId,
              recipientId: { [Op.in]: failedItems.map((f) => f.recipientId) },
            },
          },
        );
        totalFailed += failedItems.length;
      }

      logger.debug(
        {
          event: 'campaign.send.batch',
          campaignId,
          batchSize: batch.length,
          sentCount: sentIds.length,
          failedCount: failedItems.length,
        },
        'Batch processed',
      );
    }

    // Also mark any skipped (unsubscribed) pending rows as failed
    await CampaignRecipient.update(
      { status: 'failed', errorMessage: 'Recipient is unsubscribed.' },
      { where: { campaignId, status: 'pending' } },
    );

    await Campaign.update({ status: 'sent' }, { where: { id: campaignId } });

    logger.info(
      {
        event: 'campaign.send.completed',
        campaignId,
        totalSent,
        totalFailed,
        durationMs: Date.now() - startedAt,
      },
      'Campaign send completed',
    );
  } catch (err) {
    // Log but do not re-throw — campaign stays in 'sending' for recovery inspection
    logger.error(
      { event: 'campaign.send.crashed', campaignId, err: (err as Error).message },
      'Send worker crashed mid-execution',
    );
    throw err;
  }
}
