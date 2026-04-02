import { RecipientRepository } from './recipient.repository';
import { CreateRecipientDto, ListRecipientQuery } from './recipient.schema';
import { Recipient } from '../../database/models/Recipient';
import { PaginatedResult } from '../../shared/types';
import { ConflictError } from '../../shared/utils/errors';
import { logger } from '../../config/logger';

export class RecipientService {
  constructor(private readonly recipientRepository: RecipientRepository) {}

  async list(query: ListRecipientQuery): Promise<PaginatedResult<Recipient>> {
    return this.recipientRepository.findAll(query);
  }

  async create(dto: CreateRecipientDto): Promise<Recipient> {
    const existing = await this.recipientRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(
        `A recipient with email "${dto.email}" already exists.`,
        'RECIPIENT_EMAIL_EXISTS',
      );
    }

    const recipient = await this.recipientRepository.create(dto);
    logger.info({ event: 'recipient.created', recipientId: recipient.id }, 'Recipient created');
    return recipient;
  }
}
