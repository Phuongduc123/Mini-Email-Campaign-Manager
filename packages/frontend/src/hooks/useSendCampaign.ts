import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';

export const useSendCampaign = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => campaignsApi.send(id),
    onSuccess: (updated) => {
      // Set detail cache directly — avoids a redundant refetch
      queryClient.setQueryData(['campaign', id], updated);
      // Invalidate list and stats so they reflect the new sending status
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-stats', id] });
    },
  });
};
