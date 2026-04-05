/**
 * Unit tests for RecipientService.
 * All DB calls are mocked — no database connection required.
 */

import { RecipientService } from '../modules/recipients/recipient.service';
import { RecipientRepository } from '../modules/recipients/recipient.repository';
import { Recipient } from '../database/models/Recipient';
import { ConflictError } from '../shared/utils/errors';

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Factory helpers ────────────────────────────────────────────────────────────

function makeRecipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
    unsubscribed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Recipient;
}

function makeRepo(existingRecipient: Recipient | null = null): jest.Mocked<RecipientRepository> {
  const created = makeRecipient();
  return {
    findAll: jest.fn().mockResolvedValue({ items: [created], total: 1, page: 1, limit: 20, totalPages: 1 }),
    findById: jest.fn().mockResolvedValue(created),
    findByEmail: jest.fn().mockResolvedValue(existingRecipient),
    findByIds: jest.fn().mockResolvedValue([created]),
    create: jest.fn().mockResolvedValue(created),
  } as unknown as jest.Mocked<RecipientRepository>;
}

// ── RecipientService.create() ─────────────────────────────────────────────────

describe('RecipientService.create()', () => {
  it('throws ConflictError (RECIPIENT_EMAIL_EXISTS) when email is already in use', async () => {
    const repo = makeRepo(makeRecipient()); // findByEmail returns a duplicate
    const service = new RecipientService(repo);

    await expect(
      service.create({ name: 'Bob', email: 'alice@example.com' }),
    ).rejects.toMatchObject({
      code: 'RECIPIENT_EMAIL_EXISTS',
      statusCode: 409,
    });
  });

  it('delegates to repository and returns the created recipient when email is unique', async () => {
    const repo = makeRepo(null); // no existing recipient
    const service = new RecipientService(repo);

    const result = await service.create({ name: 'Bob', email: 'bob@example.com' });

    expect(repo.create).toHaveBeenCalledWith({ name: 'Bob', email: 'bob@example.com' });
    expect(result).toMatchObject({ name: 'Alice', email: 'alice@example.com' }); // from makeRecipient()
  });

  it('checks email uniqueness before creating', async () => {
    const repo = makeRepo(null);
    const service = new RecipientService(repo);

    await service.create({ name: 'Carol', email: 'carol@example.com' });

    // findByEmail must be called before create
    const findOrder = repo.findByEmail.mock.invocationCallOrder[0];
    const createOrder = repo.create.mock.invocationCallOrder[0];
    expect(findOrder).toBeLessThan(createOrder);
  });

  it('does not call repository.create when email is taken', async () => {
    const repo = makeRepo(makeRecipient());
    const service = new RecipientService(repo);

    await service.create({ name: 'Dup', email: 'alice@example.com' }).catch(() => {});

    expect(repo.create).not.toHaveBeenCalled();
  });
});

// ── RecipientService.list() ───────────────────────────────────────────────────

describe('RecipientService.list()', () => {
  it('delegates to repository with the provided query params', async () => {
    const repo = makeRepo(null);
    const service = new RecipientService(repo);

    const query = { page: 1, limit: 50 };
    const result = await service.list(query);

    expect(repo.findAll).toHaveBeenCalledWith(query);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns offset pagination metadata from the repository', async () => {
    const repo = makeRepo(null);
    repo.findAll.mockResolvedValue({
      items: [makeRecipient({ id: 5 }), makeRecipient({ id: 4 })],
      total: 45,
      page: 3,
      limit: 2,
      totalPages: 23,
    });
    const service = new RecipientService(repo);

    const result = await service.list({ page: 3, limit: 2 });

    expect(result.total).toBe(45);
    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(23);
    expect(result.items).toHaveLength(2);
  });
});
