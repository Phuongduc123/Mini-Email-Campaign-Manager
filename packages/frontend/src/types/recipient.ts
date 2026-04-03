export interface Recipient {
  id: number;
  email: string;
  name: string;
  unsubscribedAt: string | null;
  createdAt: string;
}

export interface CreateRecipientPayload {
  email: string;
  name: string;
}
