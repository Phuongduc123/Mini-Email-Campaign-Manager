import { useQuery } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';
import { CampaignStatus } from '@/types/campaign';

export const useCampaignStats = (id: number, campaignStatus: CampaignStatus | undefined) => {
  return useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => campaignsApi.getStats(id),
    enabled: !!id,
    // Poll only while actively sending; stop when tab is hidden
    refetchInterval: campaignStatus === 'sending' ? 5000 : false,
    refetchIntervalInBackground: false,
  });
};
