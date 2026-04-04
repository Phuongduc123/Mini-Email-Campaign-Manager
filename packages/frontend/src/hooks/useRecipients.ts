import { useQuery } from '@tanstack/react-query';
import { recipientsApi } from '@/api/recipients.api';

export const useRecipients = (page = 1, limit = 100) => {
  return useQuery({
    queryKey: ['recipients', page, limit],
    queryFn: () => recipientsApi.list({ page, limit }),
    staleTime: 5 * 60_000,
  });
};
