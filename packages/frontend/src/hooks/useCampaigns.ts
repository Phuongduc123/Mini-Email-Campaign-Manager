import { useQuery } from '@tanstack/react-query';
import { campaignsApi, ListCampaignsParams } from '@/api/campaigns.api';

export const useCampaigns = (params: ListCampaignsParams = {}) => {
  return useQuery({
    queryKey: ['campaigns', params],
    queryFn: () => campaignsApi.list(params),
    staleTime: 30_000,
  });
};
