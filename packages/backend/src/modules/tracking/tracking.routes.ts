import { Router, Request, Response } from 'express';
import { CampaignRecipient } from '../../database/models/CampaignRecipient';
import { logger } from '../../config/logger';

const router = Router();

// 1x1 transparent GIF — the classic tracking pixel
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * GET /track/open?c=<campaignId>&r=<recipientId>
 *
 * Called when an email client loads the tracking pixel embedded in the email body.
 * Records openedAt on the CampaignRecipient row (only on first open).
 * Always returns the pixel — never a 4xx/5xx — so the email client never shows a broken image.
 */
router.get('/open', async (req: Request, res: Response): Promise<void> => {
  const campaignId = Number(req.query.c);
  const recipientId = Number(req.query.r);

  // Always send the pixel regardless of errors
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': String(PIXEL.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(PIXEL);

  // Record the open asynchronously (after response sent)
  if (!Number.isFinite(campaignId) || !Number.isFinite(recipientId)) return;

  try {
    const [updatedCount] = await CampaignRecipient.update(
      { openedAt: new Date() },
      {
        where: {
          campaignId,
          recipientId,
          openedAt: null, // idempotent — only record first open
        },
      },
    );

    if (updatedCount > 0) {
      logger.info(
        { event: 'tracking.open', campaignId, recipientId },
        'Email open tracked',
      );
    }
  } catch (err) {
    logger.error(
      { event: 'tracking.open.error', campaignId, recipientId, err: (err as Error).message },
      'Failed to record email open',
    );
  }
});

export { router as trackingRouter };
