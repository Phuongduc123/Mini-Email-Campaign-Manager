import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { campaignRouter } from '../modules/campaigns/campaign.routes';
import { recipientRouter } from '../modules/recipients/recipient.routes';

const router = Router();

router.use('/auth', authRouter);
router.use('/campaigns', campaignRouter);
router.use('/recipients', recipientRouter);

// Note: spec uses POST /recipient (singular) — aliased here for compatibility
router.use('/recipient', recipientRouter);

export { router as apiRouter };
