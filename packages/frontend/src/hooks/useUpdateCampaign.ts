import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';
import { UpdateCampaignPayload } from '@/types/campaign';

export const useUpdateCampaign = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCampaignPayload) => campaignsApi.update(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['campaign', id], updated);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
};
