import { Op } from 'sequelize';
import { Recipient } from '../../database/models/Recipient';
import { CursorPaginatedResult } from '../../shared/types';
import { CreateRecipientDto, ListRecipientQuery } from './recipient.schema';

function encodeCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64');
}

function decodeCursor(cursor: string): number {
  return parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10);
}

export class RecipientRepository {
  async findAll(query: ListRecipientQuery): Promise<CursorPaginatedResult<Recipient>> {
    const { cursor, limit } = query;

    const where: Record<string, unknown> = {};
    if (cursor) where['id'] = { [Op.lt]: decodeCursor(cursor) };

    const rows = await Recipient.findAll({
      where,
      limit: limit + 1,
      order: [['id', 'DESC']],
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1].id) : null;

    return { items, nextCursor, hasMore };
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
