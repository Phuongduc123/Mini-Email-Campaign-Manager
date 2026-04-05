import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(255),
  subject: z.string().min(1, 'Subject is required.').max(255),
  body: z.string().min(1, 'Body is required.'),
  recipientIds: z.array(z.number().int().positive()).min(1, 'At least one recipient is required.'),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).optional(),
  recipientIds: z.array(z.number().int().positive()).optional(),
});

export const scheduleCampaignSchema = z.object({
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime.' }),
});

export const listCampaignQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent']).optional(),
  search: z.string().max(255).optional(),
});

export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignDto = z.infer<typeof updateCampaignSchema>;
export type ScheduleCampaignDto = z.infer<typeof scheduleCampaignSchema>;
export type ListCampaignQuery = z.infer<typeof listCampaignQuerySchema>;
