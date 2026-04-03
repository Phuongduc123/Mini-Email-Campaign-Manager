import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/api/campaigns.api';

export const useDeleteCampaign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => campaignsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
};
