import { Router } from 'express';
import { CampaignRepository } from './campaign.repository';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createCampaignSchema,
  updateCampaignSchema,
  scheduleCampaignSchema,
  listCampaignQuerySchema,
} from './campaign.schema';

const router = Router();

const campaignRepository = new CampaignRepository();
const campaignService = new CampaignService(campaignRepository);
const campaignController = new CampaignController(campaignService);

// All campaign routes require authentication
router.use(authenticate);

router.get('/', validate(listCampaignQuerySchema, 'query'), campaignController.list);
router.post('/', validate(createCampaignSchema), campaignController.create);

router.get('/:id', campaignController.getById);
router.patch('/:id', validate(updateCampaignSchema), campaignController.update);
router.delete('/:id', campaignController.delete);

router.post('/:id/schedule', validate(scheduleCampaignSchema), campaignController.schedule);
router.post('/:id/send', campaignController.send);
router.get('/:id/stats', campaignController.getStats);

export { router as campaignRouter };
