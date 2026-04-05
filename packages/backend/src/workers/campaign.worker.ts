/**
 * Standalone send worker — run as a separate process:
 *   yarn workspace backend worker
 *
 * Consumes jobs from the "campaign-send" BullMQ queue.
 * Each job payload: { campaignId: number }
 *
 * On success: campaign.status = 'sent', counters reflect final counts.
 * On failure after all retries: campaign.status reset to 'draft' for recovery.
 */

// Must load dotenv before any config/model imports
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Worker, Job } from 'bullmq';
import { Op } from 'sequelize';
import { createRedisConnection } from '../config/redis';
import { config } from '../config';
import { logger } from '../config/logger';
import { CAMPAIGN_QUEUE_NAME, CampaignSendJobData } from '../queue';

// Initialize Sequelize models before processing any jobs
import '../database/models/index';
import { Campaign } from '../database/models/Campaign';
import { CampaignRecipient } from '../database/models/CampaignRecipient';
import { Recipient } from '../database/models/Recipient';
import { connectDatabase } from '../config/database';

const BATCH_SIZE = 200;
const FAILURE_RATE = 0.2;
// Simulated open rate: ~35% of successfully sent emails will be "opened"
const OPEN_RATE = 0.35;

/**
 * Builds the tracking pixel <img> tag that would be embedded in the real email HTML.
 * When an email client loads this image, it hits GET /track/open and records openedAt.
 */
function buildTrackingPixelUrl(baseUrl: string, campaignId: number, recipientId: number): string {
  return `${baseUrl}/track/open?c=${campaignId}&r=${recipientId}`;
}

async function processCampaignSend(job: Job<CampaignSendJobData>): Promise<void> {
  const { campaignId } = job.data;
  const startedAt = Date.now();
  let totalSent = 0;
  let totalFailed = 0;

  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  logger.info({ event: 'worker.send.started', campaignId, jobId: job.id }, 'Worker processing campaign send');

  const campaign = await Campaign.findByPk(campaignId);

  // eslint-disable-next-line no-constant-condition
  while (true) {
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
    const failedIds: number[] = [];

    for (const cr of batch) {
      if (Math.random() > FAILURE_RATE) {
        sentIds.push(cr.recipientId);
      } else {
        failedIds.push(cr.recipientId);
      }
    }

    const now = new Date();

    if (sentIds.length > 0) {
      await CampaignRecipient.update(
        { status: 'sent', sentAt: now },
        { where: { campaignId, recipientId: { [Op.in]: sentIds } } },
      );
      await Campaign.increment({ sentCount: sentIds.length }, { where: { id: campaignId } });
      totalSent += sentIds.length;

      // Log what the real email body would look like (with tracking pixel embedded)
      for (const recipientId of sentIds) {
        const pixelUrl = buildTrackingPixelUrl(baseUrl, campaignId, recipientId);
        logger.debug(
          { event: 'worker.send.email', campaignId, recipientId, pixelUrl },
          `[SIMULATED EMAIL] Subject: ${campaign?.subject ?? ''} | Pixel: <img src="${pixelUrl}" width="1" height="1" />`,
        );
      }

      // Simulate email opens: ~OPEN_RATE of sent recipients "open" the email
      const openedIds = sentIds.filter(() => Math.random() < OPEN_RATE);
      if (openedIds.length > 0) {
        await CampaignRecipient.update(
          { openedAt: new Date() },
          {
            where: {
              campaignId,
              recipientId: { [Op.in]: openedIds },
              openedAt: null, // idempotent
            },
          },
        );
        logger.debug(
          { event: 'worker.send.opens_simulated', campaignId, count: openedIds.length },
          'Simulated email opens (tracking pixel would trigger this in production)',
        );
      }
    }

    if (failedIds.length > 0) {
      await CampaignRecipient.update(
        { status: 'failed', errorMessage: 'Simulated SMTP delivery failure.' },
        { where: { campaignId, recipientId: { [Op.in]: failedIds } } },
      );
      await Campaign.increment({ failedCount: failedIds.length }, { where: { id: campaignId } });
      totalFailed += failedIds.length;
    }

    logger.debug(
      { event: 'worker.send.batch', campaignId, batchSize: batch.length, totalSent, totalFailed },
      'Batch processed',
    );

    // Report progress to BullMQ (visible in Bull Board / monitoring)
    await job.updateProgress(Math.round(((totalSent + totalFailed) / (await CampaignRecipient.count({ where: { campaignId } }))) * 100));
  }

  // Mark any remaining pending rows (unsubscribed recipients skipped by the inner join) as failed
  const skipped = await CampaignRecipient.count({ where: { campaignId, status: 'pending' } });
  if (skipped > 0) {
    await CampaignRecipient.update(
      { status: 'failed', errorMessage: 'Recipient is unsubscribed.' },
      { where: { campaignId, status: 'pending' } },
    );
    await Campaign.increment({ failedCount: skipped }, { where: { id: campaignId } });
    totalFailed += skipped;
  }

  await Campaign.update({ status: 'sent' }, { where: { id: campaignId } });

  logger.info(
    {
      event: 'worker.send.completed',
      campaignId,
      totalSent,
      totalFailed,
      durationMs: Date.now() - startedAt,
    },
    'Campaign send completed',
  );
}

async function startWorker(): Promise<void> {
  await connectDatabase();

  const worker = new Worker<CampaignSendJobData>(
    CAMPAIGN_QUEUE_NAME,
    processCampaignSend,
    {
      connection: createRedisConnection(),
      concurrency: config.worker.concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ event: 'worker.job.completed', jobId: job.id, campaignId: job.data.campaignId }, 'Job completed');
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.error(
      { event: 'worker.job.failed', jobId: job.id, campaignId: job.data.campaignId, attempt: job.attemptsMade, err: err.message },
      'Job failed',
    );

    // On permanent failure, reset campaign to draft so it can be retried manually
    if (isLastAttempt) {
      await Campaign.update({ status: 'draft' }, { where: { id: job.data.campaignId } });
      logger.error(
        { event: 'worker.job.permanent_failure', campaignId: job.data.campaignId },
        'All retries exhausted — campaign reset to draft',
      );
    }
  });

  logger.info(
    { concurrency: config.worker.concurrency },
    `Campaign send worker started (concurrency: ${config.worker.concurrency})`,
  );
}

startWorker().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
