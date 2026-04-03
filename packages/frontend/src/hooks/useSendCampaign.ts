import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';

export const useSendCampaign = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => campaignsApi.send(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['campaign', id], updated);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-stats', id] });
    },
  });
};
