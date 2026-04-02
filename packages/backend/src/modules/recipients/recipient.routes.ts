import { Router } from 'express';
import { RecipientRepository } from './recipient.repository';
import { RecipientService } from './recipient.service';
import { RecipientController } from './recipient.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createRecipientSchema, listRecipientQuerySchema } from './recipient.schema';

const router = Router();

const recipientRepository = new RecipientRepository();
const recipientService = new RecipientService(recipientRepository);
const recipientController = new RecipientController(recipientService);

router.use(authenticate);

router.get('/', validate(listRecipientQuerySchema, 'query'), recipientController.list);
router.post('/', validate(createRecipientSchema), recipientController.create);

export { router as recipientRouter };
