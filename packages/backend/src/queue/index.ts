import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';

export const CAMPAIGN_QUEUE_NAME = 'campaign-send';

export interface CampaignSendJobData {
  campaignId: number;
}

let campaignQueue: Queue<CampaignSendJobData> | null = null;

/**
 * Returns a singleton Queue instance. Lazily created on first call.
 * The API server uses this to enqueue jobs; workers use their own connection.
 */
export function getCampaignQueue(): Queue<CampaignSendJobData> {
  if (!campaignQueue) {
    campaignQueue = new Queue<CampaignSendJobData>(CAMPAIGN_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return campaignQueue;
}
