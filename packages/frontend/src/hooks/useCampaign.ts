import { useQuery } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';

export const useCampaign = (id: number) => {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.getById(id),
    enabled: !!id,
  });
};
