import { Recipient } from '../../database/models/Recipient';
import { PaginatedResult } from '../../shared/types';
import { CreateRecipientDto, ListRecipientQuery } from './recipient.schema';

export class RecipientRepository {
  async findAll(query: ListRecipientQuery): Promise<PaginatedResult<Recipient>> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const { rows, count: total } = await Recipient.findAndCountAll({
      limit,
      offset,
      order: [['id', 'DESC']],
    });

    return {
      items: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
