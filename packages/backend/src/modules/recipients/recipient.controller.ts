import { Response, NextFunction } from 'express';
import { RecipientService } from './recipient.service';
import { CreateRecipientDto, ListRecipientQuery } from './recipient.schema';
import { AuthRequest } from '../../shared/types';
import { sendCreated, sendPaginated } from '../../shared/utils/response';

export class RecipientController {
  constructor(private readonly recipientService: RecipientService) {}

  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.recipientService.list(req.query as unknown as ListRecipientQuery);
      sendPaginated(res, result);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recipient = await this.recipientService.create(req.body as CreateRecipientDto);
      sendCreated(res, recipient);
    } catch (err) {
      next(err);
    }
  };
}
