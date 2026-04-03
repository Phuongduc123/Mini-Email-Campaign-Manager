import apiClient from './client';
import {
  Campaign,
  CampaignStats,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  ScheduleCampaignPayload,
  CampaignStatus,
} from '@/types/campaign';
import { ApiResponse, PaginatedApiResponse } from '@/types/api';

export interface ListCampaignsParams {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
}

export const campaignsApi = {
  list: async (params: ListCampaignsParams = {}): Promise<PaginatedApiResponse<Campaign>> => {
    const { data } = await apiClient.get<PaginatedApiResponse<Campaign>>('/campaigns', { params });
    return data;
  },

  getById: async (id: number): Promise<Campaign> => {
    const { data } = await apiClient.get<ApiResponse<Campaign>>(`/campaigns/${id}`);
    return data.data;
  },

  create: async (payload: CreateCampaignPayload): Promise<Campaign> => {
    const { data } = await apiClient.post<ApiResponse<Campaign>>('/campaigns', payload);
    return data.data;
  },

  update: async (id: number, payload: UpdateCampaignPayload): Promise<Campaign> => {
    const { data } = await apiClient.patch<ApiResponse<Campaign>>(`/campaigns/${id}`, payload);
    return data.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/campaigns/${id}`);
  },

  schedule: async (id: number, payload: ScheduleCampaignPayload): Promise<Campaign> => {
    const { data } = await apiClient.post<ApiResponse<Campaign>>(
      `/campaigns/${id}/schedule`,
      payload,
    );
    return data.data;
  },

  send: async (id: number): Promise<Campaign> => {
    const { data } = await apiClient.post<ApiResponse<Campaign>>(`/campaigns/${id}/send`);
    return data.data;
  },

  getStats: async (id: number): Promise<CampaignStats> => {
    const { data } = await apiClient.get<ApiResponse<CampaignStats>>(`/campaigns/${id}/stats`);
    return data.data;
  },
};
