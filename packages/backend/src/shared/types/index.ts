import { Request } from 'express';

// Augment Express Request with authenticated user
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface JwtPayload {
  id: number;
  email: string;
}

// Campaign status enum
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent';

// CampaignRecipient status enum
export type RecipientStatus = 'pending' | 'sent' | 'failed';

// Paginated response wrapper
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Cursor-based paginated response wrapper
export interface CursorPaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
