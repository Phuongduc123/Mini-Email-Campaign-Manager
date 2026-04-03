import apiClient from './client';
import { Recipient, CreateRecipientPayload } from '@/types/recipient';
import { PaginatedApiResponse, ApiResponse } from '@/types/api';

export interface ListRecipientsParams {
  page?: number;
  limit?: number;
}

export const recipientsApi = {
  list: async (params: ListRecipientsParams = {}): Promise<PaginatedApiResponse<Recipient>> => {
    const { data } = await apiClient.get<PaginatedApiResponse<Recipient>>('/recipients', {
      params,
    });
    return data;
  },

  create: async (payload: CreateRecipientPayload): Promise<Recipient> => {
    const { data } = await apiClient.post<ApiResponse<Recipient>>('/recipient', payload);
    return data.data;
  },
};
