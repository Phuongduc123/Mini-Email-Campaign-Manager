import { z } from 'zod';

export const createRecipientSchema = z.object({
  email: z.string().email('Invalid email address.'),
  name: z.string().min(1, 'Name is required.').max(255),
});

export const listRecipientQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateRecipientDto = z.infer<typeof createRecipientSchema>;
export type ListRecipientQuery = z.infer<typeof listRecipientQuerySchema>;
