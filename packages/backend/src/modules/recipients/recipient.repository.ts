import { Recipient } from '../../database/models/Recipient';
import { PaginatedResult } from '../../shared/types';
import { CreateRecipientDto, ListRecipientQuery } from './recipient.schema';

/**
 * Data-access layer for the recipients module.
 */
export class RecipientRepository {
  async findAll(query: ListRecipientQuery): Promise<PaginatedResult<Recipient>> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Recipient.findAndCountAll({
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return {
      items: rows,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async findById(id: number): Promise<Recipient | null> {
    return Recipient.findByPk(id);
  }

  async findByEmail(email: string): Promise<Recipient | null> {
    return Recipient.findOne({ where: { email } });
  }

  async findByIds(ids: number[]): Promise<Recipient[]> {
    return Recipient.findAll({ where: { id: ids } });
  }

  async create(data: CreateRecipientDto): Promise<Recipient> {
    return Recipient.create(data);
  }
}
