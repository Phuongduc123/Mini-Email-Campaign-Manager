import type { Recipient } from './recipient';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent';
export type RecipientStatus = 'pending' | 'sent' | 'failed';

export interface Campaign {
  id: number;
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  campaignRecipients?: CampaignRecipientEntry[];
}

export interface CampaignRecipientEntry {
  campaignId: number;
  recipientId: number;
  status: RecipientStatus;
  sentAt: string | null;
  openedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  recipient?: Recipient;
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  opened: number;
  open_rate: number;
  send_rate: number;
}

export interface CreateCampaignPayload {
  name: string;
  subject: string;
  body: string;
  recipientIds: number[];
}

export interface UpdateCampaignPayload {
  name?: string;
  subject?: string;
  body?: string;
  recipientIds?: number[];
}

export interface ScheduleCampaignPayload {
  scheduledAt: string;
}
