import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';
import { CreateCampaignPayload } from '@/types/campaign';

export const useCreateCampaign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCampaignPayload) => campaignsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
};
