import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';
import { ScheduleCampaignPayload } from '@/types/campaign';

export const useScheduleCampaign = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ScheduleCampaignPayload) => campaignsApi.schedule(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['campaign', id], updated);
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
};
