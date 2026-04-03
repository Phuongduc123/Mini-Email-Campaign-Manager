import { Response, NextFunction } from 'express';
import { CampaignService } from './campaign.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  ListCampaignQuery,
} from './campaign.schema';
import { AuthRequest } from '../../shared/types';
import { sendSuccess, sendCreated, sendDeleted, sendCursorPaginated } from '../../shared/utils/response';

export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.campaignService.list(
        req.user!.id,
        req.query as unknown as ListCampaignQuery,
      );
      sendCursorPaginated(res, result);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await this.campaignService.getById(Number(req.params.id), req.user!.id);
      sendSuccess(res, campaign);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await this.campaignService.create(
        req.body as CreateCampaignDto,
        req.user!.id,
      );
      sendCreated(res, campaign);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await this.campaignService.update(
        Number(req.params.id),
        req.body as UpdateCampaignDto,
        req.user!.id,
      );
      sendSuccess(res, campaign);
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.campaignService.delete(Number(req.params.id), req.user!.id);
      sendDeleted(res);
    } catch (err) {
      next(err);
    }
  };

  schedule = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await this.campaignService.schedule(
        Number(req.params.id),
        req.body as ScheduleCampaignDto,
        req.user!.id,
      );
      sendSuccess(res, campaign);
    } catch (err) {
      next(err);
    }
  };

  send = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await this.campaignService.send(Number(req.params.id), req.user!.id);
      res.status(202).json({
        data: campaign,
        message: 'Campaign send initiated. Poll GET /campaigns/:id/stats to track progress.',
      });
    } catch (err) {
      next(err);
    }
  };

  getStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.campaignService.getStats(Number(req.params.id), req.user!.id);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  };
}
