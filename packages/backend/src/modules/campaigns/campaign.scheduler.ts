/**
 * Scheduling is now handled by BullMQ delayed jobs.
 * When a campaign is scheduled via CampaignService.schedule(), a delayed job
 * is enqueued with `delay = scheduledAt - now`. BullMQ fires it at the right
 * time without any cron polling, and the worker process handles the send.
 *
 * This file is kept as a stub so existing imports do not break.
 */
import { logger } from '../../config/logger';

export function startCampaignScheduler(): void {
  logger.info({}, 'Campaign scheduling is handled by BullMQ delayed jobs — no cron needed');
}
