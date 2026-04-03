import { useQuery } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';
import { CampaignStatus } from '@/types/campaign';

export const useCampaignStats = (id: number, campaignStatus: CampaignStatus | undefined) => {
  return useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => campaignsApi.getStats(id),
    enabled: !!id,
    refetchInterval: campaignStatus === 'sending' ? 2000 : false,
  });
};
